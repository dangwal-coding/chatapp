import * as CryptoJS from 'crypto-js'

// Shared decrypt helper used by Home and Mobile views.
// Keep the same key derivation parameters as the original implementation.
const CHAT_PASSPHRASE = 'Change_This_Passphrase_To_StrongKey'
const SALT_HEX = 'a1b2c3d4e5f6a7b8'
const KEY = CryptoJS.PBKDF2(CHAT_PASSPHRASE, CryptoJS.enc.Hex.parse(SALT_HEX), { keySize: 256 / 32, iterations: 1000 })

export function decryptMessage(payload) {
  try {
    if (!payload || typeof payload !== 'string') return ''
    if (!payload.includes(':')) return payload // assume plain text
    const [ivHex, ctBase64] = payload.split(':')
    const iv = CryptoJS.enc.Hex.parse(ivHex)
    const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext: CryptoJS.enc.Base64.parse(ctBase64) })
    const bytes = CryptoJS.AES.decrypt(cipherParams, KEY, { iv })
    const txt = bytes.toString(CryptoJS.enc.Utf8)
    return txt || '[Decrypt Fail]'
  } catch {
    return '[Decrypt Error]'
  }
}

export default {
  decryptMessage
}
