require('dotenv').config();
const crypto = require('node:crypto');
const prisma = require('./lib/prisma');

const vessels = [
  ['9482154', '636019842', 'Arabian Sea Trader', 'India', 'Tanker'],
  ['9310842', '538006214', 'Konkan Horizon', 'Marshall Islands', 'Bulk Carrier'],
  ['9604122', '356789012', 'Coastal Meridian', 'Singapore', 'Container Carrier'],
  ['9756023', '412345678', 'Gulf Response', 'UAE', 'Product Tanker'],
  [null, '419876543', 'Malabar Surveyor', 'India', 'Research Vessel']
];

async function main() {
  await prisma.alertEvent.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.aisPosition.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.vessel.deleteMany();

  const vesselRows = [];
  for (const [imoNumber, mmsi, vesselName, flag, vesselType] of vessels) {
    vesselRows.push(await prisma.vessel.create({ data: { imoNumber, mmsi, vesselName, flag, vesselType, status: 'DEMO DATA' } }));
  }

  const now = Date.now();
  for (const [index, vessel] of vesselRows.entries()) {
    for (let point = 0; point < 3; point += 1) {
      await prisma.aisPosition.create({ data: {
        vesselId: vessel.id,
        latitude: 18.5 + index * 0.2 + point * 0.01,
        longitude: 72.8 + index * 0.15 + point * 0.01,
        speedKnots: 8 + index + point,
        courseDegrees: 90 + point * 8,
        recordedAt: new Date(now - (point + 1) * 15 * 60 * 1000)
      } });
    }
  }

  const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'HIGH', 'MEDIUM', 'LOW', 'CRITICAL'];
  const statuses = ['INVESTIGATING', 'NEW', 'CONFIRMED', 'RESOLVED', 'DISMISSED', 'NEW', 'INVESTIGATING', 'NEW'];
  const incidents = [];
  for (let index = 0; index < 8; index += 1) {
    const incident = await prisma.incident.create({ data: {
      incidentCode: `DEMO-${2026}-${String(index + 1).padStart(3, '0')}`,
      title: `Arabian Sea potential oil-like anomaly ${index + 1}`,
      status: statuses[index],
      severity: severities[index],
      confidenceScore: 61 + index * 4,
      detectedAt: new Date(now - (index + 1) * 6 * 60 * 60 * 1000),
      latitude: 18.2 + index * 0.08,
      longitude: 72.7 + index * 0.1,
      estimatedAreaKm2: 2.5 + index * 1.4,
      source: 'DEMO',
      summary: 'Synthetic demonstration incident for testing the investigation workflow. It is not a real pollution accusation.',
      vesselId: index < 5 ? vesselRows[index % vesselRows.length].id : null,
      alertEvents: { create: [
        { eventType: 'CREATED', message: 'Demo incident created by seed data.', actor: 'SEED' },
        { eventType: 'REVIEW_NOTE', message: 'Requires authorised verification.', actor: 'SEED' }
      ] }
    } });
    incidents.push(incident);
  }

  for (const incident of incidents.slice(0, 3)) {
    const metadataJson = { source: 'DEMO', note: 'Integrity-tracking example only.' };
    const canonical = JSON.stringify({ evidenceType: 'SAR_METADATA', fileUrl: null, metadataJson });
    await prisma.evidence.create({ data: {
      incidentId: incident.id,
      evidenceType: 'SAR_METADATA',
      metadataJson,
      sha256Hash: crypto.createHash('sha256').update(canonical).digest('hex')
    } });
  }

  console.log(`Seeded ${vesselRows.length} vessels, ${incidents.length} incidents, AIS positions, timelines, and evidence.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
