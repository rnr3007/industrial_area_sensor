import { Router } from 'express';
import HttpError, { asyncHandler } from '../utils/http-error.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { buildReport, renderReportPdf, renderReportExcel } from '../services/report.service.js';

const router = Router();
router.use(authenticate);

function parseParams(req) {
  const companyId = req.query.companyId || req.params.companyId;
  if (!companyId) throw HttpError.badRequest('companyId is required');

  const to = req.query.to ? new Date(req.query.to) : new Date();
  const from = req.query.from
    ? new Date(req.query.from)
    : new Date(to.getTime() - 7 * 86_400_000);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw HttpError.badRequest('Invalid from/to date');
  }
  if (from >= to) throw HttpError.badRequest('"from" must be earlier than "to"');
  if (to - from > 366 * 86_400_000) throw HttpError.badRequest('Maximum report range is 366 days');

  const bucket = req.query.bucket === 'day' ? 'day' : 'hour';
  return { companyId, from, to, bucket };
}

const slug = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** JSON preview so the UI can show the report before downloading it. */
router.get(
  '/preview',
  asyncHandler(async (req, res) => {
    const params = parseParams(req);
    if (!req.user.canAccessCompany(params.companyId)) throw HttpError.forbidden('No access to this site');

    const report = await buildReport(params);
    res.json({
      company: { id: report.company._id, name: report.company.name, code: report.company.code },
      from: report.from,
      to: report.to,
      bucket: report.bucket,
      summary: report.summary,
      alertSummary: report.alertSummary,
      rows: report.rows,
      alerts: report.alerts.slice(0, 50)
    });
  })
);

router.get(
  '/pdf',
  audit('report.export.pdf', 'report'),
  asyncHandler(async (req, res) => {
    const params = parseParams(req);
    if (!req.user.canAccessCompany(params.companyId)) throw HttpError.forbidden('No access to this site');

    const report = await buildReport(params);
    const buffer = await renderReportPdf(report);
    const filename = `ias-report-${slug(report.company.code)}-${report.from
      .toISOString()
      .slice(0, 10)}_${report.to.toISOString().slice(0, 10)}.pdf`;

    res.locals.auditResourceId = String(report.company._id);
    res.locals.auditMeta = { company: report.company.name, from: report.from, to: report.to };

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  })
);

router.get(
  '/excel',
  audit('report.export.excel', 'report'),
  asyncHandler(async (req, res) => {
    const params = parseParams(req);
    if (!req.user.canAccessCompany(params.companyId)) throw HttpError.forbidden('No access to this site');

    const report = await buildReport(params);
    const buffer = await renderReportExcel(report);
    const filename = `ias-report-${slug(report.company.code)}-${report.from
      .toISOString()
      .slice(0, 10)}_${report.to.toISOString().slice(0, 10)}.xlsx`;

    res.locals.auditResourceId = String(report.company._id);
    res.locals.auditMeta = { company: report.company.name, from: report.from, to: report.to };

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  })
);

export default router;
