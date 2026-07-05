import express from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import os from 'os';
import { performBackup, getBackupStatus } from '../services/backup';

const router = express.Router();

/**
 * Super Diagnostic Node
 * Performs a comprehensive system-wide health check.
 * Accessible only by SUPER_ADMIN for security.
 */
router.get('/check', authenticateToken, authorizeRoles('SUPER_ADMIN'), async (req, res) => {
  const report: any = {
    timestamp: new Date().toISOString(),
    status: 'OPTIMAL',
    nodes: {
      database: { status: 'UNKNOWN' },
      environment: { status: 'UNKNOWN' },
      fileSystem: { status: 'UNKNOWN' },
      backup: { status: 'UNKNOWN' },
      system: {
        platform: os.platform(),
        uptime: os.uptime(),
        memory: {
          total: Math.round(os.totalmem() / 1024 / 1024) + 'MB',
          free: Math.round(os.freemem() / 1024 / 1024) + 'MB'
        }
      }
    },
    issues: [] as string[]
  };

  // 1. Database Diagnostic
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    
    const counts = await Promise.all([
      prisma.user.count(),
      prisma.member.count(),
      prisma.invoice.count(),
      prisma.auditLog.count()
    ]);

    report.nodes.database = {
      status: 'CONNECTED',
      latency: `${latency}ms`,
      registryCounts: {
        users: counts[0],
        members: counts[1],
        invoices: counts[2],
        auditLogs: counts[3]
      }
    };
  } catch (error: any) {
    report.status = 'DEGRADED';
    report.nodes.database.status = 'CRITICAL';
    report.issues.push(`Database Connection Failure: ${error.message}`);
  }

  // 2. Environment Node Diagnostic
  const requiredEnv = ['DATABASE_URL', 'JWT_SECRET', 'PORT'];
  const missingEnv = requiredEnv.filter(key => !process.env[key]);
  
  report.nodes.environment = {
    status: missingEnv.length === 0 ? 'HEALTHY' : 'INCOMPLETE',
    configuredNodes: requiredEnv.length - missingEnv.length,
    missingNodes: missingEnv
  };
  
  if (missingEnv.length > 0) {
    report.status = 'DEGRADED';
    report.issues.push(`Missing Critical Environment Nodes: ${missingEnv.join(', ')}`);
  }

  // 3. Schema Integrity Check (Orphaned records)
  try {
    const orphanedInvoices = await prisma.invoice.count({
      where: { memberId: { notIn: (await prisma.member.findMany({ select: { id: true } })).map(m => m.id) } }
    });
    
    if (orphanedInvoices > 0) {
      report.issues.push(`Data Integrity Alert: Found ${orphanedInvoices} orphaned invoices.`);
    }
  } catch (err) {}

  // 4. Backup Service Diagnostic
  report.nodes.backup = getBackupStatus();

  res.json(report);
});

/**
 * List Recovery Snapshots
 */
router.get('/backups', authenticateToken, authorizeRoles('SUPER_ADMIN'), async (req, res) => {
  const status = getBackupStatus();
  res.json(status.backups);
});

/**
 * Manual Backup Trigger
 * Allows SUPER_ADMIN to force a registry snapshot.
 */
router.post('/backup', authenticateToken, authorizeRoles('SUPER_ADMIN'), async (req, res) => {
  const result = await performBackup();
  if (result.success) {
    res.json({ status: 'SUCCESS', message: 'Registry snapshot committed to storage.', filename: result.filename });
  } else {
    res.status(500).json({ status: 'ERROR', message: 'Backup failed' });
  }
});

/**
 * Emergency System Reset (Seed Only)
 * Allows SUPER_ADMIN to re-trigger the seed script if registry is corrupt.
 */
router.post('/reseed', authenticateToken, authorizeRoles('SUPER_ADMIN'), async (req, res) => {
  try {
    const { exec } = require('child_process');
    exec('npx ts-node prisma/seed.ts', (error: any, stdout: any, stderr: any) => {
      if (error) {
        return res.status(500).json({ status: 'ERROR', message: stderr });
      }
      res.json({ status: 'SUCCESS', message: 'Registry seeding node re-initialized.' });
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * Clear All Data (SUPER_ADMIN ONLY)
 * Deletes all business data while preserving users, roles, and permissions.
 */
router.delete('/clear-all', authenticateToken, authorizeRoles('SUPER_ADMIN'), async (req, res) => {
  try {
    await prisma.$transaction(async (tx) => {
      // Children first (respect FK constraints)
      await tx.message.deleteMany();
      await tx.orderItem.deleteMany();
      await tx.invoiceItem.deleteMany();
      await tx.payment.deleteMany();
      await tx.maintenanceLog.deleteMany();
      await tx.inventoryLog.deleteMany();
      await tx.feedback.deleteMany();
      await tx.exportRequest.deleteMany();
      await tx.auditLog.deleteMany();
      await tx.familyMember.deleteMany();
      await tx.invoice.deleteMany();
      await tx.complaint.deleteMany();
      await tx.order.deleteMany();
      await tx.aMCPaymentRequest.deleteMany();
      await tx.unenrollmentRequest.deleteMany();
      await tx.accessLog.deleteMany();
      await tx.walkInGuest.deleteMany();
      await tx.tableReservation.deleteMany();
      await tx.reservation.deleteMany();
      await tx.housekeepingTaskInstance.deleteMany();
      await tx.housekeepingAllocation.deleteMany();
      await tx.housekeepingDeepCleaning.deleteMany();
      await tx.housekeepingFloorTemplate.deleteMany();
      await tx.housekeepingTask.deleteMany();
      await tx.staffAttendance.deleteMany();
      await tx.staffSalary.deleteMany();
      await tx.leaveBalance.deleteMany();
      await tx.staffLeave.deleteMany();
      await tx.announcement.deleteMany();
      await tx.activity.deleteMany();
      await tx.menuItem.deleteMany();
      await tx.inventoryItem.deleteMany();
      await tx.asset.deleteMany();
      await tx.restaurantTable.deleteMany();
      await tx.recipe.deleteMany();
      await tx.member.deleteMany();
    });

    res.json({ message: 'All business data cleared. Users, roles, and permissions preserved.' });
  } catch (error: any) {
    console.error('[ClearAll] Failed:', error);
    res.status(500).json({ message: 'Failed to clear data', error: error.message });
  }
});

export default router;
