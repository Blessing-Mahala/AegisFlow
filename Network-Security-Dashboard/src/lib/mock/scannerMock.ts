export interface ScanHost {
  ip: string
  hostname: string
  macVendor: string
  osGuess: string
  latency: number
  openPorts: ScanPort[]
}

export interface ScanPort {
  port: number
  state: 'open' | 'filtered' | 'closed'
  service: string
  banner: string
}

export interface ScanResult {
  targetSubnet: string
  profile: 'quick' | 'standard' | 'deep'
  startedAt: string
  completedAt: string
  hosts: ScanHost[]
  totalHosts: number
  totalOpenPorts: number
}

const OS_GUESSES = [
  'Linux 5.x',
  'Windows Server 2022',
  'macOS Ventura',
  'FreeBSD 13',
  'Cisco IOS',
  'Ubuntu 22.04',
  'Debian 12',
  'Android 14',
  'Windows 11 Pro',
  'OpenBSD 7.4',
]

const MAC_VENDORS = [
  'Cisco Systems',
  'Intel Corporate',
  'Dell Inc.',
  'Hewlett Packard',
  'Apple Inc.',
  'VMware Inc.',
  'Aruba Networks',
  'Ubiquiti Inc.',
  'Broadcom Inc.',
  'Mellanox Technologies',
]

const SERVICES_BY_PORT: Record<number, string> = {
  22: 'SSH',
  23: 'Telnet',
  25: 'SMTP',
  53: 'DNS',
  80: 'HTTP',
  110: 'POP3',
  143: 'IMAP',
  443: 'HTTPS',
  445: 'SMB',
  1433: 'MSSQL',
  3306: 'MySQL',
  3389: 'RDP',
  5432: 'PostgreSQL',
  6379: 'Redis',
  8080: 'HTTP-Proxy',
  8443: 'HTTPS-Alt',
  9090: 'Prometheus',
  27017: 'MongoDB',
}

const BANNERS_BY_SERVICE: Record<string, string[]> = {
  SSH: ['OpenSSH_9.3p1 Ubuntu-1ubuntu3', 'OpenSSH_8.9p1 Debian-3', 'SSH-2.0-OpenSSH_9.6'],
  HTTP: [
    'Apache/2.4.57 (Ubuntu)',
    'nginx/1.24.0',
    'Microsoft-IIS/10.0',
    'Caddy/2.7.5',
  ],
  HTTPS: [
    'Apache/2.4.57 (Ubuntu) OpenSSL/3.0.8',
    'nginx/1.24.0 + OpenSSL 3.1.2',
    'cloudflare',
  ],
  DNS: ['BIND 9.18.19', 'dnsmasq-2.90', 'Unbound 1.17.1'],
  MySQL: ['mysql_native_password', 'MySQL 8.0.35', 'MariaDB 10.11.6'],
  PostgreSQL: ['PostgreSQL 15.4 (Debian)', 'PostgreSQL 16.1'],
  SMB: ['Samba 4.17.12', 'Samba 4.19.2'],
  RDP: ['Microsoft RDP 10.0.22621', 'xrdp 0.9.23'],
  Redis: ['redis 7.2.3', 'redis 6.2.14'],
}

const KNOWN_TCP_PORTS = Object.keys(SERVICES_BY_PORT).map(Number)

export function generateOSGuess(): string {
  return OS_GUESSES[Math.floor(Math.random() * OS_GUESSES.length)]
}

export function generateMACVendor(): string {
  return MAC_VENDORS[Math.floor(Math.random() * MAC_VENDORS.length)]
}

export function generateHostname(ip: string): string {
  const octets = ip.split('.').slice(2).join('-')
  const types = [
    'web',
    'db',
    'app',
    'cache',
    'monitor',
    'gateway',
    'mail',
    'dns',
    'api',
    'storage',
  ]
  const type = types[Math.floor(Math.random() * types.length)]
  const env = Math.random() > 0.5 ? 'prod' : 'staging'
  return `${type}-${octets}.${env}.internal`
}

export function generateBanner(port: number, service: string): string {
  const banners = BANNERS_BY_SERVICE[service]
  if (banners) {
    return banners[Math.floor(Math.random() * banners.length)]
  }
  return `${service} service running on port ${port}`
}

function generateIp(subnet: string): string {
  const base = subnet.replace('0/24', '').replace('0/16', '').replace('0/8', '')
  if (subnet.includes('/24')) {
    return `${base}${Math.floor(Math.random() * 254) + 1}`
  }
  if (subnet.includes('/16')) {
    return `${base}${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`
  }
  return `${base}${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`
}

function pickOpenPort(): ScanPort {
  const portIdx = Math.floor(Math.random() * KNOWN_TCP_PORTS.length)
  const port = KNOWN_TCP_PORTS[portIdx]
  const service = SERVICES_BY_PORT[port]
  return {
    port,
    state: Math.random() > 0.15 ? 'open' : 'filtered',
    service,
    banner: generateBanner(port, service),
  }
}

function generateUniquePorts(count: number): ScanPort[] {
  const usedPorts = new Set<number>()
  const ports: ScanPort[] = []
  const available = [...KNOWN_TCP_PORTS]
  // shuffle
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[available[i], available[j]] = [available[j], available[i]]
  }
  for (const portNum of available) {
    if (ports.length >= count) break
    if (usedPorts.has(portNum)) continue
    usedPorts.add(portNum)
    const service = SERVICES_BY_PORT[portNum]
    ports.push({
      port: portNum,
      state: Math.random() > 0.15 ? 'open' : 'filtered',
      service,
      banner: generateBanner(portNum, service),
    })
  }
  return ports
}

export function generateScanResults(
  targetSubnet: string,
  profile: 'quick' | 'standard' | 'deep',
): ScanResult {
  const hostCount = profile === 'quick'
    ? Math.floor(Math.random() * 5) + 3
    : profile === 'standard'
      ? Math.floor(Math.random() * 10) + 8
      : Math.floor(Math.random() * 15) + 10

  const portCount = profile === 'quick' ? 2 : profile === 'standard' ? 5 : 12

  const hosts: ScanHost[] = []
  const usedIps = new Set<string>()

  for (let i = 0; i < hostCount; i++) {
    let ip = generateIp(targetSubnet)
    // Ensure unique IPs
    while (usedIps.has(ip)) {
      ip = generateIp(targetSubnet)
    }
    usedIps.add(ip)
    hosts.push({
      ip,
      hostname: generateHostname(ip),
      macVendor: generateMACVendor(),
      osGuess: generateOSGuess(),
      latency: Math.round(Math.random() * 150 + 1),
      openPorts: generateUniquePorts(Math.min(portCount, Math.floor(Math.random() * portCount) + 1)),
    })
  }
  const totalOpenPorts = hosts.reduce((sum, h) => sum + h.openPorts.length, 0)

  const now = new Date()
  const startedAt = new Date(now.getTime() - hostCount * 2000).toISOString()

  return {
    targetSubnet,
    profile,
    startedAt,
    completedAt: now.toISOString(),
    hosts,
    totalHosts: hostCount,
    totalOpenPorts,
  }
}
