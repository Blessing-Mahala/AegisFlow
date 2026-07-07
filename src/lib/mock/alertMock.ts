import { getMitreMapping } from '../mitre-attack';

export interface MockAlert {
  id: string
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: 'port_scan' | 'ddos' | 'brute_force' | 'malware' | 'anomaly'
  srcIp: string
  dstIp: string
  protocol: string
  port: number
  status: 'open' | 'acknowledged' | 'mitigated' | 'dismissed'
  createdAt: string
  mitreId: string
  mitreTactic: string
}

const ALERT_TEMPLATES: Record<string, Array<{ title: string; description: string }>> = {
  port_scan: [
    { title: 'Port Scan Detected', description: 'Rapid sequential port scan detected from external host targeting firewall ports 1-1024.' },
    { title: 'Vertical Port Scan', description: 'Multiple ports probed on a single host in under 2 seconds — possible reconnaissance.' },
    { title: 'Horizontal Port Scan', description: 'Same port (22/SSH) scanned across 50+ hosts — SSH sweep in progress.' },
    { title: 'Stealth SYN Scan', description: 'Low-and-slow SYN scan detected spanning 15 minutes with jittered intervals.' },
  ],
  ddos: [
    { title: 'Volumetric DDoS Attack', description: 'Inbound traffic surged to 12.4 Gbps from 300+ unique IPs — possible UDP amplification.' },
    { title: 'SYN Flood', description: '40,000+ half-open TCP connections from randomized source IPs filling connection table.' },
    { title: 'DNS Amplification', description: 'DNS response traffic 50x larger than queries, 15 Gbps total — memcached/DRDoS style.' },
    { title: 'HTTP Flood', description: 'Application-layer flood hitting /api/v1 at 25,000 req/s from a botnet of 2,000+ hosts.' },
  ],
  brute_force: [
    { title: 'SSH Brute Force', description: '600+ failed SSH login attempts from 203.0.113.42 in the last 5 minutes.' },
    { title: 'RDP Brute Force', description: 'Consecutive RDP authentication failures from multiple source IPs targeting domain admin.' },
    { title: 'Database Credential Stuffing', description: 'PostgreSQL port 5432 bombarded with 300+ login attempts using common credentials.' },
    { title: 'Web Login Brute Force', description: '/wp-admin endpoint hit with 1,200+ login attempts across 30 different usernames.' },
  ],
  malware: [
    { title: 'C2 Beacon Detected', description: 'Outbound connections to known C2 server 185.234.72.18:443 with periodic interval pattern.' },
    { title: 'Ransomware File Extension Change', description: 'Host 10.0.0.45 renamed 350+ files to .encrypted extension in under 10 seconds.' },
    { title: 'DNS TXT Exfiltration', description: 'Unusual DNS TXT queries with base64-encoded strings to suspicious domain.' },
    { title: 'Worm Propagation', description: 'Self-replicating outbound connections on ports 445/SMB from internal host spreading to adjacent subnets.' },
  ],
  anomaly: [
    { title: 'Data Exfiltration via ICMP', description: 'Large ICMP packets (65KB+) leaving network to external IP — potential covert channel.' },
    { title: 'Unusual DNS Query Pattern', description: 'Domain generation algorithm (DGA) pattern detected in 200+ DNS queries per minute.' },
    { title: 'Non-Business Hours Access', description: 'Admin account accessed critical database at 3:14 AM from non-corporate VPN IP.' },
    { title: 'Geolocation Anomaly', description: 'User authenticated from both Singapore and Frankfurt within 4 minutes — token theft suspected.' },
  ],
}

const PROTOCOLS = ['TCP', 'UDP', 'ICMP', 'DNS', 'HTTP']
const SEVERITIES: Array<MockAlert['severity']> = ['critical', 'high', 'medium', 'low']
const CATEGORIES = Object.keys(ALERT_TEMPLATES) as MockAlert['category'][]

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomIp(): string {
  if (Math.random() > 0.5) {
    return `${Math.floor(Math.random() * 223) + 10}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`
  }
  return `192.168.${Math.floor(Math.random() * 10) + 1}.${Math.floor(Math.random() * 254) + 1}`
}

function generateAlert(createdAt?: string): MockAlert {
  const category = randomItem(CATEGORIES)
  const template = randomItem(ALERT_TEMPLATES[category])

  let severity: MockAlert['severity']
  switch (category) {
    case 'ddos':
      severity = Math.random() > 0.5 ? 'critical' : 'high'
      break
    case 'malware':
      severity = Math.random() > 0.3 ? 'high' : 'critical'
      break
    case 'brute_force':
      severity = 'high'
      break
    case 'port_scan':
      severity = Math.random() > 0.5 ? 'medium' : 'low'
      break
    default:
      severity = randomItem(SEVERITIES)
  }

  const mitre = getMitreMapping(template.title, category)

  return {
    id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: template.title,
    description: template.description,
    severity,
    category,
    srcIp: randomIp(),
    dstIp: randomIp(),
    protocol: randomItem(PROTOCOLS),
    port: Math.floor(Math.random() * 60000) + 1,
    status: 'open',
    createdAt: createdAt || new Date().toISOString(),
    mitreId: mitre.techniqueId,
    mitreTactic: mitre.tactic,
  }
}

/**
 * Starts an alert stream that pushes a new mock alert every 10–30 seconds.
 * Returns a cleanup function.
 */
export function startAlertStream(
  onAlert: (alert: MockAlert) => void,
): () => void {
  function schedule() {
    const delay = Math.floor(Math.random() * 20000) + 10000 // 10-30s

    return setTimeout(() => {
      const alert = generateAlert()
      onAlert(alert)
      schedule()
    }, delay)
  }

  const timeoutId = schedule()

  return () => clearTimeout(timeoutId)
}

export { generateAlert }
