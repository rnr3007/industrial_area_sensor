import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import Reading, { METRICS, METRIC_LABELS } from '../models/Reading.js';
import Alert from '../models/Alert.js';
import Company from '../models/Company.js';
import HttpError from '../utils/http-error.js';

const BUCKETS = {
  hour: { unit: 'hour', binSize: 1 },
  day: { unit: 'day', binSize: 1 }
};

const round = (value, digits = 2) =>
  value === null || value === undefined || Number.isNaN(value)
    ? null
    : Number(Number(value).toFixed(digits));

/**
 * Aggregate readings into time buckets plus an overall summary and the alerts
 * raised in the window. Shared by the PDF, the Excel sheet and the JSON preview.
 */
export async function buildReport({ companyId, from, to, bucket = 'hour' }) {
  const company = await Company.findById(companyId).lean();
  if (!company) throw HttpError.notFound('Company not found');

  const bucketSpec = BUCKETS[bucket] || BUCKETS.hour;
  const match = { company: company._id, ts: { $gte: from, $lte: to } };

  const avgStage = {};
  const minStage = {};
  const maxStage = {};
  for (const metric of METRICS) {
    avgStage[`avg_${metric}`] = { $avg: `$${metric}` };
    minStage[`min_${metric}`] = { $min: `$${metric}` };
    maxStage[`max_${metric}`] = { $max: `$${metric}` };
  }

  const series = await Reading.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateTrunc: { date: '$ts', unit: bucketSpec.unit, binSize: bucketSpec.binSize } },
        samples: { $sum: 1 },
        ...avgStage,
        ...minStage,
        ...maxStage,
        firstIntake: { $min: '$intakeTotalM3' },
        lastIntake: { $max: '$intakeTotalM3' }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const rows = series.map((row) => {
    const entry = { ts: row._id, samples: row.samples };
    for (const metric of METRICS) {
      entry[metric] = {
        avg: round(row[`avg_${metric}`]),
        min: round(row[`min_${metric}`]),
        max: round(row[`max_${metric}`])
      };
    }
    entry.intakeM3 =
      row.lastIntake != null && row.firstIntake != null
        ? round(row.lastIntake - row.firstIntake)
        : null;
    return entry;
  });

  const [overall] = await Reading.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        samples: { $sum: 1 },
        ...avgStage,
        ...minStage,
        ...maxStage,
        firstIntake: { $min: '$intakeTotalM3' },
        lastIntake: { $max: '$intakeTotalM3' }
      }
    }
  ]);

  const summary = { samples: overall?.samples ?? 0, metrics: {} };
  for (const metric of METRICS) {
    summary.metrics[metric] = {
      label: METRIC_LABELS[metric].label,
      unit: METRIC_LABELS[metric].unit,
      avg: round(overall?.[`avg_${metric}`]),
      min: round(overall?.[`min_${metric}`]),
      max: round(overall?.[`max_${metric}`])
    };
  }
  summary.totalIntakeM3 =
    overall?.lastIntake != null && overall?.firstIntake != null
      ? round(overall.lastIntake - overall.firstIntake)
      : null;

  const quota = company.waterIntake?.quotaM3PerDay ?? 0;
  const days = Math.max(1, (to - from) / 86_400_000);
  summary.quotaM3 = quota ? round(quota * days) : null;
  summary.quotaUsagePct =
    summary.quotaM3 && summary.totalIntakeM3 != null
      ? round((summary.totalIntakeM3 / summary.quotaM3) * 100, 1)
      : null;

  const alerts = await Alert.find({ company: company._id, ts: { $gte: from, $lte: to } })
    .sort({ ts: -1 })
    .limit(500)
    .lean();

  const alertSummary = alerts.reduce(
    (acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      acc.total += 1;
      return acc;
    },
    { total: 0, info: 0, warning: 0, critical: 0 }
  );

  return { company, from, to, bucket, rows, summary, alerts, alertSummary };
}

const fmtDate = (date) =>
  new Date(date).toLocaleString('en-GB', { timeZone: 'UTC', hour12: false }).replace(',', '');

export async function renderReportExcel(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Industrial Area Sensor';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Field', key: 'field', width: 28 },
    { header: 'Value', key: 'value', width: 44 }
  ];
  summarySheet.addRows([
    { field: 'Company', value: report.company.name },
    { field: 'Code', value: report.company.code },
    { field: 'Address', value: report.company.address || '-' },
    { field: 'Coordinates', value: `${report.company.location.lat}, ${report.company.location.lng}` },
    { field: 'Water source', value: report.company.waterIntake?.sourceType || '-' },
    { field: 'Permit number', value: report.company.waterIntake?.permitNumber || '-' },
    { field: 'Period (UTC)', value: `${fmtDate(report.from)} - ${fmtDate(report.to)}` },
    { field: 'Samples', value: report.summary.samples },
    { field: 'Total intake (m3)', value: report.summary.totalIntakeM3 ?? '-' },
    { field: 'Permit allowance (m3)', value: report.summary.quotaM3 ?? '-' },
    { field: 'Quota usage (%)', value: report.summary.quotaUsagePct ?? '-' },
    { field: 'Alerts (total)', value: report.alertSummary.total },
    { field: 'Alerts (critical)', value: report.alertSummary.critical },
    { field: 'Alerts (warning)', value: report.alertSummary.warning },
    { field: 'Generated at (UTC)', value: fmtDate(new Date()) }
  ]);
  summarySheet.getRow(1).font = { bold: true };

  const metricsSheet = workbook.addWorksheet('Metrics');
  metricsSheet.columns = [
    { header: 'Metric', key: 'metric', width: 20 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Average', key: 'avg', width: 14 },
    { header: 'Minimum', key: 'min', width: 14 },
    { header: 'Maximum', key: 'max', width: 14 }
  ];
  for (const [key, stat] of Object.entries(report.summary.metrics)) {
    metricsSheet.addRow({
      metric: stat.label,
      unit: stat.unit || '-',
      avg: stat.avg ?? '-',
      min: stat.min ?? '-',
      max: stat.max ?? '-',
      key
    });
  }
  metricsSheet.getRow(1).font = { bold: true };

  const dataSheet = workbook.addWorksheet('Readings');
  dataSheet.columns = [
    { header: `Timestamp (UTC, per ${report.bucket})`, key: 'ts', width: 24 },
    { header: 'Samples', key: 'samples', width: 10 },
    ...METRICS.flatMap((metric) => [
      { header: `${METRIC_LABELS[metric].label} avg`, key: `${metric}_avg`, width: 16 },
      { header: `${METRIC_LABELS[metric].label} min`, key: `${metric}_min`, width: 16 },
      { header: `${METRIC_LABELS[metric].label} max`, key: `${metric}_max`, width: 16 }
    ]),
    { header: 'Intake (m3)', key: 'intake', width: 14 }
  ];
  for (const row of report.rows) {
    const flat = { ts: fmtDate(row.ts), samples: row.samples, intake: row.intakeM3 ?? '-' };
    for (const metric of METRICS) {
      flat[`${metric}_avg`] = row[metric].avg ?? '-';
      flat[`${metric}_min`] = row[metric].min ?? '-';
      flat[`${metric}_max`] = row[metric].max ?? '-';
    }
    dataSheet.addRow(flat);
  }
  dataSheet.getRow(1).font = { bold: true };
  dataSheet.views = [{ state: 'frozen', ySplit: 1 }];

  const alertSheet = workbook.addWorksheet('Alerts');
  alertSheet.columns = [
    { header: 'Timestamp (UTC)', key: 'ts', width: 24 },
    { header: 'Severity', key: 'severity', width: 12 },
    { header: 'Type', key: 'type', width: 18 },
    { header: 'Device', key: 'deviceId', width: 20 },
    { header: 'Message', key: 'message', width: 60 },
    { header: 'Status', key: 'status', width: 14 }
  ];
  for (const alert of report.alerts) {
    alertSheet.addRow({
      ts: fmtDate(alert.ts),
      severity: alert.severity,
      type: alert.type,
      deviceId: alert.deviceId,
      message: alert.message,
      status: alert.status
    });
  }
  alertSheet.getRow(1).font = { bold: true };

  return workbook.xlsx.writeBuffer();
}

export function renderReportPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.fontSize(18).font('Helvetica-Bold').text('Industrial Area Sensor', { align: 'left' });
    doc.fontSize(12).font('Helvetica').fillColor('#555').text('Monitoring report');
    doc.moveDown(0.8);
    doc.fillColor('#000');

    doc.fontSize(14).font('Helvetica-Bold').text(report.company.name);
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#444')
      .text(
        [
          `Code: ${report.company.code}`,
          report.company.address ? `Address: ${report.company.address}` : null,
          `Coordinates: ${report.company.location.lat}, ${report.company.location.lng}`,
          `Water source: ${report.company.waterIntake?.sourceType || '-'}`,
          `Permit: ${report.company.waterIntake?.permitNumber || '-'}`,
          `Period (UTC): ${fmtDate(report.from)} - ${fmtDate(report.to)}`,
          `Generated (UTC): ${fmtDate(new Date())}`
        ]
          .filter(Boolean)
          .join('\n')
      );
    doc.fillColor('#000').moveDown(1);

    // --- Summary tiles -------------------------------------------------
    const tiles = [
      ['Samples', String(report.summary.samples)],
      ['Total intake', report.summary.totalIntakeM3 != null ? `${report.summary.totalIntakeM3} m3` : '-'],
      ['Quota usage', report.summary.quotaUsagePct != null ? `${report.summary.quotaUsagePct}%` : '-'],
      ['Alerts', `${report.alertSummary.total} (${report.alertSummary.critical} critical)`]
    ];
    const tileWidth = pageWidth / tiles.length;
    const tileTop = doc.y;
    tiles.forEach(([label, value], index) => {
      const x = doc.page.margins.left + index * tileWidth;
      doc.roundedRect(x + 2, tileTop, tileWidth - 4, 46, 4).fillAndStroke('#f5f7fa', '#d9e0e8');
      doc.fillColor('#666').fontSize(8).text(label.toUpperCase(), x + 10, tileTop + 8, {
        width: tileWidth - 20
      });
      doc.fillColor('#111').fontSize(13).font('Helvetica-Bold').text(value, x + 10, tileTop + 22, {
        width: tileWidth - 20
      });
    });
    doc.y = tileTop + 60;
    doc.font('Helvetica').fillColor('#000');

    // --- Metric summary table -------------------------------------------
    doc.fontSize(12).font('Helvetica-Bold').text('Metric summary');
    doc.moveDown(0.4);
    const metricCols = [
      { label: 'Metric', width: pageWidth * 0.3 },
      { label: 'Unit', width: pageWidth * 0.14 },
      { label: 'Average', width: pageWidth * 0.18 },
      { label: 'Minimum', width: pageWidth * 0.19 },
      { label: 'Maximum', width: pageWidth * 0.19 }
    ];
    drawTable(
      doc,
      metricCols,
      Object.values(report.summary.metrics).map((stat) => [
        stat.label,
        stat.unit || '-',
        stat.avg ?? '-',
        stat.min ?? '-',
        stat.max ?? '-'
      ])
    );

    // --- Time series ----------------------------------------------------
    doc.moveDown(1);
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#000').text(`Readings (per ${report.bucket})`);
    doc.moveDown(0.4);
    const seriesCols = [
      { label: 'Timestamp (UTC)', width: pageWidth * 0.24 },
      { label: 'Level (m)', width: pageWidth * 0.13 },
      { label: 'Flow (m3/h)', width: pageWidth * 0.14 },
      { label: 'pH', width: pageWidth * 0.11 },
      { label: 'Turbidity', width: pageWidth * 0.13 },
      { label: 'TDS', width: pageWidth * 0.12 },
      { label: 'Temp (C)', width: pageWidth * 0.13 }
    ];
    drawTable(
      doc,
      seriesCols,
      report.rows.slice(0, 300).map((row) => [
        fmtDate(row.ts),
        row.waterLevelM.avg ?? '-',
        row.flowRateM3h.avg ?? '-',
        row.ph.avg ?? '-',
        row.turbidityNtu.avg ?? '-',
        row.tdsPpm.avg ?? '-',
        row.temperatureC.avg ?? '-'
      ])
    );
    if (report.rows.length > 300) {
      doc
        .moveDown(0.3)
        .fontSize(8)
        .fillColor('#777')
        .text(`... ${report.rows.length - 300} further rows omitted, see the Excel export.`);
    }

    // --- Alerts ---------------------------------------------------------
    if (report.alerts.length) {
      doc.addPage();
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#000').text('Alerts in period');
      doc.moveDown(0.4);
      const alertCols = [
        { label: 'Timestamp (UTC)', width: pageWidth * 0.22 },
        { label: 'Severity', width: pageWidth * 0.12 },
        { label: 'Device', width: pageWidth * 0.18 },
        { label: 'Message', width: pageWidth * 0.48 }
      ];
      drawTable(
        doc,
        alertCols,
        report.alerts
          .slice(0, 200)
          .map((alert) => [fmtDate(alert.ts), alert.severity, alert.deviceId || '-', alert.message])
      );
    }

    // --- Page numbers ---------------------------------------------------
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .fillColor('#888')
        .text(
          `Page ${i - range.start + 1} of ${range.count}`,
          doc.page.margins.left,
          doc.page.height - 30,
          { width: pageWidth, align: 'center' }
        );
    }

    doc.end();
  });
}

function drawTable(doc, columns, rows) {
  const startX = doc.page.margins.left;
  const rowHeight = 16;

  const header = () => {
    let x = startX;
    doc.rect(startX, doc.y, columns.reduce((s, c) => s + c.width, 0), rowHeight).fill('#eef2f7');
    doc.fillColor('#333').fontSize(8).font('Helvetica-Bold');
    const y = doc.y + 4.5;
    for (const col of columns) {
      doc.text(col.label, x + 4, y, { width: col.width - 8, ellipsis: true });
      x += col.width;
    }
    doc.y += rowHeight;
    doc.font('Helvetica').fillColor('#111');
  };

  header();

  rows.forEach((row, index) => {
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
      header();
    }
    if (index % 2 === 1) {
      doc
        .rect(startX, doc.y, columns.reduce((s, c) => s + c.width, 0), rowHeight)
        .fill('#fafbfc');
    }
    doc.fillColor('#111').fontSize(8);
    let x = startX;
    const y = doc.y + 4.5;
    row.forEach((cell, i) => {
      doc.text(String(cell), x + 4, y, { width: columns[i].width - 8, ellipsis: true });
      x += columns[i].width;
    });
    doc.y += rowHeight;
  });
}
