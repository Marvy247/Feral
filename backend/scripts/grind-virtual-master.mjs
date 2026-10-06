/**
 * Grind a TIP-1022 registration salt for registerVirtualMaster().
 *
 *   registrationHash = keccak256(abi.encodePacked(masterAddress, salt))
 *   require(registrationHash[0:4] == 0x00000000)   // 32-bit PoW
 *   masterId = registrationHash[4:8]
 *
 * Usage: node scripts/grind-virtual-master.mjs <0xmasterAddress>
 * Prints: { salt, masterId } as JSON.
 */
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

if (isMainThread) {
  const address = (process.argv[2] || '').replace(/^0x/, '')
  if (!/^[0-9a-fA-F]{40}$/.test(address)) {
    console.error('Usage: node grind-virtual-master.mjs <0xmasterAddress>')
    process.exit(1)
  }
  const WORKERS = 8
  const started = Date.now()
  let done = 0
  console.error(`grinding ${WORKERS} workers for address 0x${address}...`)

  const progress = setInterval(() => {
    console.error(`  ~${(done * WORKERS / 1e6).toFixed(0)}M hashes (${((Date.now() - started) / 1000).toFixed(0)}s)`)
  }, 10000)

  for (let w = 0; w < WORKERS; w++) {
    const worker = new Worker(new URL(import.meta.url), {
      workerData: { address, start: w, step: WORKERS },
    })
    worker.on('message', (msg) => {
      clearInterval(progress)
      console.error(`found after ~${((done + 1) * WORKERS / 1e6).toFixed(0)}M hashes in ${((Date.now() - started) / 1000).toFixed(1)}s`)
      console.log(JSON.stringify(msg))
      for (let k = 0; k < WORKERS; k++) { /* terminate all below */ }
      process.exit(0)
    })
    worker.on('error', (err) => { console.error('worker error', err); process.exit(1) })
    worker.on('exit', () => { done++ })
  }
} else {
  const { keccak_256 } = require('@noble/hashes/sha3')

  const addrBytes = Buffer.from(workerData.address, 'hex') // 20 bytes
  const buf = Buffer.alloc(52) // 20 (address) + 32 (salt), salt starts zeroed
  addrBytes.copy(buf, 0)

  let i = workerData.start
  const STEP = workerData.step
  const SALT_OFFSET = 20

  for (;;) {
    // salt = big-endian 32-byte encoding of i (fits safely in 2^53)
    const hi = Math.floor(i / 4294967296)
    const lo = i >>> 0
    buf.writeUInt32BE(hi, SALT_OFFSET + 24)
    buf.writeUInt32BE(lo, SALT_OFFSET + 28)

    const hash = keccak_256(buf)
    if (hash[0] === 0 && hash[1] === 0 && hash[2] === 0 && hash[3] === 0) {
      const saltHex = '0x' + buf.subarray(SALT_OFFSET).toString('hex')
      const masterId = '0x' + Buffer.from(hash.subarray(4, 8)).toString('hex')
      parentPort.postMessage({ salt: saltHex, masterId })
      break
    }
    i += STEP
  }
}
