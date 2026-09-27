import jwt from 'jsonwebtoken';
export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer <TOKEN>
    if (!token) {
        res.status(401).json({ error: 'Akses ditolak: Token autentikasi tidak ditemukan' });
        return;
    }
    const secret = process.env.JWT_SECRET || 'fallback_secret_key';
    jwt.verify(token, secret, (err, decodedUser) => {
        if (err) {
            res.status(403).json({ error: 'Akses ditolak: Token tidak valid atau sudah kedaluwarsa' });
            return;
        }
        req.user = decodedUser;
        next();
    });
};
//# sourceMappingURL=auth.middleware.js.map