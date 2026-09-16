import { Router } from 'express';
import ExcelJS from 'exceljs';
import AuditLog from '../models/AuditLog.js';
import { asyncHandler } from '../utils/http-error.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, authorize('admin'));

function buildFilter(query) {
  const { userId, action, resource, success, q, from, to } = query;
  const filter = {};
  if (userId) filter.user = userId;
  if (action) filter.action = new RegExp(`^${action}`, 'i');
  if (resource) filter.resource = resource;
  if (success !== undefined && success !== '') filter.success = success === 'true';
  if (q) {
    filter.$or = [
      { userName: new RegExp(q, 'i') },
      { userEmail: new RegExp(q, 'i') },
      { path: new RegExp(q, 'i') }
    ];
  }
  if (from || to) {
    filter.ts = {};
    if (from) filter.ts.$gte = new Date(from);
    if (to) filter.ts.$lte = new Date(to);
  }
  return filter;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 50 } = req.query;
    const filter = buildFilter(req.query);
    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ ts: -1 })
        .skip(skip)
        .limit(Math.min(Number(limit), 200))
        .lean(),
      AuditLog.countDocuments(filter)
    ]);

    res.json({ items, total, page: Number(page), limit: Number(limit) });
  })
);

/** Distinct action names, so the UI filter stays in sync with reality. */
router.get(
  '/actions',
  asyncHandler(async (_req, res) => {
    const actions = await AuditLog.distinct('action');
    res.json({ items: actions.sort() });
  })
);

router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const filter = buildFilter(req.query);
    const items = await AuditLog.find(filter).sort({ ts: -1 }).limit(20000).lean();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Audit trail');
    sheet.columns = [
      { header: 'Timestamp (UTC)', key: 'ts', width: 24 },
      { header: 'User', key: 'userName', width: 24 },
      { header: 'Email', key: 'userEmail', width: 28 },
      { header: 'Role', key: 'role', width: 12 },
      { header: 'Action', key: 'action', width: 26 },
      { header: 'Resource', key: 'resource', width: 16 },
      { header: 'Resource ID', key: 'resourceId', width: 26 },
      { header: 'Method', key: 'method', width: 10 },
      { header: 'Path', key: 'path', width: 40 },
      { header: 'Status', key: 'statusCode', width: 10 },
      { header: 'Success', key: 'success', width: 10 },
      { header: 'IP', key: 'ip', width: 18 },
      { header: 'User agent', key: 'userAgent', width: 40 }
    ];
    sheet.getRow(1).font = { bold: true };
    for (const item of items) {
      sheet.addRow({
        ...item,
        ts: new Date(item.ts).toISOString(),
        success: item.success ? 'yes' : 'no'
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit-trail-${new Date().toISOString().slice(0, 10)}.xlsx"`
    );
    res.send(Buffer.from(buffer));
  })
);

export default router;
