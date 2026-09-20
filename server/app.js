require('dotenv').config();
const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const prisma = require('./lib/prisma');
const {
  incidentCreateSchema,
  incidentPatchSchema,
  vesselCreateSchema,
  positionSchema,
  evidenceSchema
} = require('./validation');

const app = express();
const apiRouter = express.Router();
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5500,http://127.0.0.1:5500,https://oik-spill.vercel.app')
  .split(',').map((origin) => origin.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS origin is not allowed.'));
  }
}));
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));

const incidentInclude = {
  vessel: true,
  alertEvents: { orderBy: { createdAt: 'asc' } },
  evidence: { orderBy: { createdAt: 'asc' } }
};

function errorResponse(code, message, details = []) {
  return { error: { code, message, details } };
}

function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function serializeIncident(incident) {
  return {
    ...incident,
    confidenceScore: incident.confidenceScore == null ? null : Number(incident.confidenceScore),
    estimatedAreaKm2: incident.estimatedAreaKm2 == null ? null : Number(incident.estimatedAreaKm2)
  };
}

function toFrontendSpill(incident) {
  return {
    id: incident.incidentCode,
    title: incident.title,
    severity: incident.severity.toLowerCase(),
    status: incident.status,
    coords: [incident.latitude, incident.longitude],
    areaKm2: incident.estimatedAreaKm2,
    volumeBbls: null,
    confidence: incident.confidenceScore,
    sensor: incident.source === 'DEMO' ? 'Demo dataset' : incident.source,
    detectedAt: incident.detectedAt,
    wind: 'Unavailable',
    current: 'Unavailable',
    surfaceTemp: 'Unavailable',
    slickType: 'Not determined from SAR alone',
    thumbnail: 'assets/images/sar_slick_detail.jpg',
    primarySuspect: incident.vessel ? {
      name: incident.vessel.vesselName,
      imo: incident.vessel.imoNumber,
      confidence: incident.confidenceScore,
      matchType: 'Potential source candidate'
    } : null,
    slickPolygon: []
  };
}

function toFrontendVessel(vessel) {
  const latest = vessel.aisPositions?.[0];
  return {
    name: vessel.vesselName,
    imo: vessel.imoNumber,
    mmsi: vessel.mmsi,
    flag: vessel.flag,
    type: vessel.vesselType,
    coords: latest ? [latest.latitude, latest.longitude] : null,
    heading: latest?.courseDegrees || 0,
    speed: latest?.speedKnots || 0,
    lastAisPing: latest?.recordedAt || 'Unavailable',
    signalHealth: vessel.status || 'Unknown',
    isDarkVessel: false,
    riskScore: null,
    riskLevel: 'UNKNOWN',
    trackHistory: vessel.aisPositions?.map((position) => [position.latitude, position.longitude]) || []
  };
}

function validateBody(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
    const error = new Error('Request validation failed.');
    error.status = 400;
    error.code = 'VALIDATION_ERROR';
    error.details = details;
    throw error;
  }
  return parsed.data;
}

function getIncidentOr404(id) {
  return prisma.incident.findUnique({ where: { id }, include: incidentInclude }).then((incident) => {
    if (!incident) {
      const error = new Error('Incident not found.');
      error.status = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }
    return incident;
  });
}

apiRouter.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'spillguard-api', timestamp: new Date().toISOString() });
});

apiRouter.get('/incidents', async (req, res) => {
  const page = parsePositiveInt(req.query.page, 1, 100000);
  const limit = parsePositiveInt(req.query.limit, 20, 100);
  const sortBy = ['detectedAt', 'createdAt', 'severity', 'status'].includes(req.query.sortBy) ? req.query.sortBy : 'detectedAt';
  const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';
  const where = {};
  if (req.query.status) where.status = String(req.query.status).toUpperCase();
  if (req.query.severity) where.severity = String(req.query.severity).toUpperCase();
  if (req.query.search) {
    const search = String(req.query.search);
    where.OR = [{ title: { contains: search, mode: 'insensitive' } }, { incidentCode: { contains: search, mode: 'insensitive' } }, { summary: { contains: search, mode: 'insensitive' } }];
  }
  const [total, incidents] = await Promise.all([
    prisma.incident.count({ where }),
    prisma.incident.findMany({ where, include: incidentInclude, orderBy: { [sortBy]: sortOrder }, skip: (page - 1) * limit, take: limit })
  ]);
  res.json({ data: incidents.map(serializeIncident), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

apiRouter.get('/incidents/:id', async (req, res) => {
  res.json(serializeIncident(await getIncidentOr404(req.params.id)));
});

apiRouter.post('/incidents', async (req, res) => {
  const data = validateBody(incidentCreateSchema, req.body);
  const incident = await prisma.incident.create({
    data: { ...data, incidentCode: `SG-${new Date().getUTCFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`, alertEvents: { create: { eventType: 'CREATED', message: 'Incident created.', actor: 'API' } } },
    include: incidentInclude
  });
  res.status(201).json(serializeIncident(incident));
});

apiRouter.patch('/incidents/:id', async (req, res) => {
  const data = validateBody(incidentPatchSchema, req.body);
  await getIncidentOr404(req.params.id);
  const incident = await prisma.incident.update({
    where: { id: req.params.id },
    data: { ...data, alertEvents: { create: { eventType: 'UPDATED', message: `Incident updated: ${Object.keys(data).join(', ')}.`, actor: 'API' } } },
    include: incidentInclude
  });
  res.json(serializeIncident(incident));
});

apiRouter.get('/incidents/:id/timeline', async (req, res) => {
  await getIncidentOr404(req.params.id);
  res.json(await prisma.alertEvent.findMany({ where: { incidentId: req.params.id }, orderBy: { createdAt: 'asc' } }));
});

apiRouter.post('/incidents/:id/evidence', async (req, res) => {
  const data = validateBody(evidenceSchema, req.body);
  await getIncidentOr404(req.params.id);
  const canonical = JSON.stringify({ evidenceType: data.evidenceType, fileUrl: data.fileUrl || null, metadataJson: data.metadataJson });
  const evidence = await prisma.evidence.create({ data: { ...data, metadataJson: data.metadataJson, sha256Hash: crypto.createHash('sha256').update(canonical).digest('hex'), incidentId: req.params.id } });
  res.status(201).json(evidence);
});

apiRouter.get('/vessels', async (req, res) => {
  const page = parsePositiveInt(req.query.page, 1, 100000);
  const limit = parsePositiveInt(req.query.limit, 20, 100);
  const search = req.query.search ? String(req.query.search) : undefined;
  const where = search ? { OR: [{ vesselName: { contains: search, mode: 'insensitive' } }, { imoNumber: { contains: search, mode: 'insensitive' } }, { mmsi: { contains: search, mode: 'insensitive' } }] } : {};
  const [total, vessels] = await Promise.all([prisma.vessel.count({ where }), prisma.vessel.findMany({ where, include: { aisPositions: { orderBy: { recordedAt: 'desc' }, take: 1 } }, orderBy: { vesselName: 'asc' }, skip: (page - 1) * limit, take: limit })]);
  res.json({ data: vessels, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

apiRouter.get('/vessels/:id', async (req, res) => {
  const vessel = await prisma.vessel.findUnique({ where: { id: req.params.id }, include: { aisPositions: { orderBy: { recordedAt: 'desc' }, take: 50 }, incidents: { orderBy: { detectedAt: 'desc' } } } });
  if (!vessel) { const error = new Error('Vessel not found.'); error.status = 404; error.code = 'NOT_FOUND'; throw error; }
  res.json(vessel);
});

apiRouter.post('/vessels', async (req, res) => {
  const data = validateBody(vesselCreateSchema, req.body);
  res.status(201).json(await prisma.vessel.create({ data }));
});

apiRouter.post('/vessels/:id/positions', async (req, res) => {
  const data = validateBody(positionSchema, req.body);
  const vessel = await prisma.vessel.findUnique({ where: { id: req.params.id } });
  if (!vessel) { const error = new Error('Vessel not found.'); error.status = 404; error.code = 'NOT_FOUND'; throw error; }
  res.status(201).json(await prisma.aisPosition.create({ data: { ...data, vesselId: req.params.id } }));
});

apiRouter.get('/dashboard/summary', async (req, res) => {
  const [totalIncidents, activeIncidents, criticalIncidents, confirmedIncidents, totalVessels, recentIncidents] = await Promise.all([
    prisma.incident.count(),
    prisma.incident.count({ where: { status: { in: ['NEW', 'INVESTIGATING'] } } }),
    prisma.incident.count({ where: { severity: 'CRITICAL' } }),
    prisma.incident.count({ where: { status: 'CONFIRMED' } }),
    prisma.vessel.count(),
    prisma.incident.findMany({ orderBy: { detectedAt: 'desc' }, take: 5, include: { vessel: true } })
  ]);
  const severityValues = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const statusValues = ['NEW', 'INVESTIGATING', 'CONFIRMED', 'DISMISSED', 'RESOLVED'];
  const incidentsBySeverity = Object.fromEntries(await Promise.all(severityValues.map(async (severity) => [severity, await prisma.incident.count({ where: { severity } })])));
  const incidentsByStatus = Object.fromEntries(await Promise.all(statusValues.map(async (status) => [status, await prisma.incident.count({ where: { status } })])));
  res.json({ totalIncidents, activeIncidents, criticalIncidents, confirmedIncidents, totalVessels, incidentsBySeverity, incidentsByStatus, recentIncidents });
});

apiRouter.get('/bootstrap', async (req, res) => {
  const [incidents, vessels] = await Promise.all([
    prisma.incident.findMany({ orderBy: { detectedAt: 'desc' }, include: { vessel: true } }),
    prisma.vessel.findMany({ include: { aisPositions: { orderBy: { recordedAt: 'desc' }, take: 20 } } })
  ]);
  res.json({ spills: incidents.map(toFrontendSpill), vessels: vessels.map(toFrontendVessel), dataSource: 'API' });
});

app.use('/api', apiRouter);

app.use((req, res, next) => {
  const error = new Error('API route not found.');
  error.status = 404;
  error.code = 'NOT_FOUND';
  next(error);
});

app.use((error, req, res, next) => {
  const status = error.status || 500;
  const code = error.code || (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');
  if (status >= 500) console.error(error);
  res.status(status).json(errorResponse(code, error.message || 'Unexpected server error.', error.details || []));
});

module.exports = { app, prisma };
