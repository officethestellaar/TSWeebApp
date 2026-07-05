"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const prisma_1 = __importDefault(require("../lib/prisma"));
const auth_1 = require("../middleware/auth");
const socket_1 = require("../lib/socket");
const router = express_1.default.Router();
// Create export request (any authenticated user)
router.post('/', auth_1.authenticateToken, async (req, res) => {
    try {
        const { page, reason, params } = req.body;
        if (!page || !reason) {
            return res.status(400).json({ message: 'Page and reason are required.' });
        }
        const request = await prisma_1.default.exportRequest.create({
            data: {
                userId: req.user.userId,
                page,
                reason,
                params: params ? JSON.stringify(params) : null,
            },
        });
        (0, socket_1.emitEvent)('new_export_request', {
            requestId: request.id,
            userName: req.user.name,
            page,
            reason,
            createdAt: request.createdAt,
        }, { role: 'SUPER_ADMIN' });
        res.status(201).json(request);
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Failed to create export request' });
    }
});
// Get pending requests (SUPER_ADMIN only)
router.get('/pending', auth_1.authenticateToken, (0, auth_1.authorizeRoles)('SUPER_ADMIN'), async (req, res) => {
    try {
        const requests = await prisma_1.default.exportRequest.findMany({
            where: { status: 'PENDING' },
            include: { user: { select: { name: true, email: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(requests);
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Failed to fetch requests' });
    }
});
// Get my requests (any user)
router.get('/my', auth_1.authenticateToken, async (req, res) => {
    try {
        const requests = await prisma_1.default.exportRequest.findMany({
            where: { userId: req.user.userId },
            orderBy: { createdAt: 'desc' },
        });
        res.json(requests);
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Failed to fetch requests' });
    }
});
// Approve request (SUPER_ADMIN only)
router.patch('/:id/approve', auth_1.authenticateToken, (0, auth_1.authorizeRoles)('SUPER_ADMIN'), async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id))
            return res.status(400).json({ message: 'Invalid ID.' });
        const request = await prisma_1.default.exportRequest.update({
            where: { id },
            data: { status: 'APPROVED', approvedAt: new Date() },
        });
        (0, socket_1.emitEvent)('export_request_approved', {
            requestId: request.id,
            page: request.page,
        }, { userId: request.userId });
        res.json({ message: 'Export request approved.' });
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Failed to approve request' });
    }
});
// Reject request (SUPER_ADMIN only)
router.patch('/:id/reject', auth_1.authenticateToken, (0, auth_1.authorizeRoles)('SUPER_ADMIN'), async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id))
            return res.status(400).json({ message: 'Invalid ID.' });
        const request = await prisma_1.default.exportRequest.update({
            where: { id },
            data: { status: 'REJECTED', rejectedAt: new Date() },
        });
        (0, socket_1.emitEvent)('export_request_rejected', {
            requestId: request.id,
            page: request.page,
        }, { userId: request.userId });
        res.json({ message: 'Export request rejected.' });
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Failed to reject request' });
    }
});
exports.default = router;
