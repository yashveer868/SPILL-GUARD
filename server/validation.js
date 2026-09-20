const { z } = require('zod');

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
const isoDate = z.coerce.date();
const optionalString = z.string().trim().max(500).optional().nullable();

const incidentCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  latitude,
  longitude,
  detectedAt: isoDate,
  summary: z.string().trim().min(1).max(5000),
  confidenceScore: z.number().min(0).max(100).optional().nullable(),
  estimatedAreaKm2: z.number().min(0).optional().nullable(),
  vesselId: z.string().trim().min(1).optional().nullable(),
  source: z.enum(['SAR', 'MANUAL', 'DEMO', 'API']).default('API')
});

const incidentPatchSchema = z.object({
  status: z.enum(['NEW', 'INVESTIGATING', 'CONFIRMED', 'DISMISSED', 'RESOLVED']).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  confidenceScore: z.number().min(0).max(100).optional().nullable(),
  summary: z.string().trim().min(1).max(5000).optional(),
  vesselId: z.string().trim().min(1).optional().nullable(),
  estimatedAreaKm2: z.number().min(0).optional().nullable()
}).refine((value) => Object.keys(value).length > 0, 'At least one update field is required');

const vesselCreateSchema = z.object({
  imoNumber: optionalString,
  mmsi: optionalString,
  vesselName: z.string().trim().min(1).max(200),
  flag: optionalString,
  vesselType: optionalString,
  status: optionalString
});

const positionSchema = z.object({
  latitude,
  longitude,
  speedKnots: z.number().min(0).optional().nullable(),
  courseDegrees: z.number().min(0).max(360).optional().nullable(),
  recordedAt: isoDate
});

const evidenceSchema = z.object({
  evidenceType: z.string().trim().min(1).max(100),
  fileUrl: z.string().url().optional().nullable(),
  metadataJson: z.record(z.string(), z.unknown()).default({})
});

module.exports = {
  incidentCreateSchema,
  incidentPatchSchema,
  vesselCreateSchema,
  positionSchema,
  evidenceSchema
};
