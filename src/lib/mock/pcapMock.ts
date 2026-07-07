export interface PcapSession {
  id: string
  srcIp: string
  dstIp: string
  srcPort: number
  dstPort: number
  protocol: 'TCP' | 'UDP' | 'DNS' | 'HTTP' | 'ICMP'
  duration: number // ms
  packetCount: number
  byteCount: number
  status: 'completed' | 'active' | 'reset' | 'timeout'
  startTime: string
}

export interface PacketDetail {
  seqNumber: number
  timestamp: string
  flags: string[]
  payloadSize: number
  srcIp: string
  dstIp: string
  protocol: string
}

const PROTOCOL_WEIGHTS = [
  { protocol: 'TCP' as const, weight: 50 },
  { protocol: 'UDP' as const, weight: 25 },
  { protocol: 'DNS' as const, weight: 10 },
  { protocol: 'HTTP' as const, weight: 10 },
  { protocol: 'ICMP' as const, weight: 5 },
]

const STATUSES: Array<PcapSession['status']> = [
  'completed',
  'completed',
  'completed',
  'completed',
  'active',
  'reset',
  'timeout',
]

function pickWeightedProtocol(): PcapSession['protocol'] {
  const totalWeight = PROTOCOL_WEIGHTS.reduce((s, p) => s + p.weight, 0)
  let rand = Math.floor(Math.random() * totalWeight)
  for (const p of PROTOCOL_WEIGHTS) {
    rand -= p.weight
    if (rand < 0) return p.protocol
  }
  return 'TCP'
}

function randomIp(): string {
  return `${Math.floor(Math.random() * 223) + 10}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`
}

function randomPort(): number {
  const commonPorts = [22, 80, 443, 3306, 5432, 6379, 8080, 8443, 53, 1433, 3389]
  if (Math.random() > 0.3) {
    return commonPorts[Math.floor(Math.random() * commonPorts.length)]
  }
  return Math.floor(Math.random() * 65535) + 1024
}

export function generateSessions(
  fileName: string,
  fileSize: number,
): PcapSession[] {
  const count = Math.min(
    Math.floor(Math.random() * 130) + 20,
    Math.floor(fileSize / 50000) + 20,
  )

  const sessions: PcapSession[] = []
  const baseTime = Date.now() - count * 1000

  for (let i = 0; i < count; i++) {
    const protocol = pickWeightedProtocol()
    const isExternal = Math.random() > 0.5
    const srcIp = isExternal ? randomIp() : '192.168.1.' + Math.floor(Math.random() * 254 + 1)
    const dstIp = isExternal ? '192.168.1.' + Math.floor(Math.random() * 254 + 1) : randomIp()
    const duration = Math.random() * 30000 + 50
    const startTime = new Date(baseTime + i * 800).toISOString()

    sessions.push({
      id: `session-${fileName}-${i}`,
      srcIp,
      dstIp,
      srcPort: randomPort(),
      dstPort: protocol === 'DNS' ? 53 : randomPort(),
      protocol,
      duration: Math.round(duration),
      packetCount: Math.floor(Math.random() * 500) + 2,
      byteCount: Math.floor(Math.random() * 100000) + 64,
      status: STATUSES[Math.floor(Math.random() * STATUSES.length)],
      startTime,
    })
  }

  return sessions
}

export function generatePacketLevelDetails(sessionId: string): PacketDetail[] {
  const count = Math.floor(Math.random() * 50) + 5
  const packets: PacketDetail[] = []
  const baseTime = Date.now() - count * 10

  const flagsPool = [
    ['SYN'],
    ['SYN', 'ACK'],
    ['ACK'],
    ['PSH', 'ACK'],
    ['FIN', 'ACK'],
    ['RST'],
  ]

  for (let i = 0; i < count; i++) {
    packets.push({
      seqNumber: i + 1,
      timestamp: new Date(baseTime + i * 15).toISOString(),
      flags: flagsPool[Math.floor(Math.random() * flagsPool.length)],
      payloadSize: Math.floor(Math.random() * 1460) + 40,
      srcIp: '192.168.1.100',
      dstIp: '10.0.0.1',
      protocol: 'TCP',
    })
  }

  return packets
}
