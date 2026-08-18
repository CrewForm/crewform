import crypto from 'crypto';

export function decryptApiKey(encryptedKey: string): string {
    if (!encryptedKey.startsWith('v1:')) return encryptedKey;
    const keyValue = process.env.API_KEY_ENCRYPTION_KEY;
    if (!keyValue) throw new Error('API_KEY_ENCRYPTION_KEY is required');
    const key = /^[0-9a-f]{64}$/i.test(keyValue)
        ? Buffer.from(keyValue, 'hex')
        : Buffer.from(keyValue, 'base64');
    if (key.length !== 32) throw new Error('API_KEY_ENCRYPTION_KEY must decode to 32 bytes');
    const [, ivB64, ciphertextB64] = encryptedKey.split(':');
    const packed = Buffer.from(ciphertextB64, 'base64');
    if (packed.length < 17) throw new Error('Invalid encrypted secret');
    const authTag = packed.subarray(packed.length - 16);
    const ciphertext = packed.subarray(0, packed.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function encryptApiKey(rawKey: string): string {
    const keyValue = process.env.API_KEY_ENCRYPTION_KEY;
    if (!keyValue) throw new Error('API_KEY_ENCRYPTION_KEY is required');
    const key = /^[0-9a-f]{64}$/i.test(keyValue)
        ? Buffer.from(keyValue, 'hex')
        : Buffer.from(keyValue, 'base64');
    if (key.length !== 32) throw new Error('API_KEY_ENCRYPTION_KEY must decode to 32 bytes');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(rawKey, 'utf8'), cipher.final()]);
    return `v1:${iv.toString('base64')}:${Buffer.concat([ciphertext, cipher.getAuthTag()]).toString('base64')}`;
}

export function hashApiKey(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey).digest('hex');
}
