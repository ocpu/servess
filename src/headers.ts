type stringable = string | { toString(): string }

const irregularHeaderNames = {
  'www-authenticate': 'WWW-Authenticate',
  te: 'TE',
  'accept-ch': 'Accept-CH',
  'accept-ch-lifetime': 'Accept-CH-Lifetime',
  etag: 'ETag',
  dnt: 'DNT',
  'except-ct': 'Except-CT',
  'x-xss-protection': 'X-XSS-Protection',
  nel: 'NEL',
  'sec-websocket-key': 'Sec-WebSocket-Key',
  'sec-websocket-extensions': 'Sec-WebSocket-Extensions',
  'sec-websocket-accept': 'Sec-WebSocket-Accept',
  'sec-websocket-protocol': 'Sec-WebSocket-Protocol',
  'sec-websocket-version': 'Sec-WebSocket-Version',
  sourcemap: 'SourceMap',
  'x-dns-prefetch-control': 'X-DNS-Prefetch-Control',
  'x-ua-compatible ': 'X-UA-Compatible ',
}

function toHeaderName(name: string) {
  //@ts-ignore
  if (name in irregularHeaderNames) return irregularHeaderNames[name]
  return name.replace(/^([a-z])|\-([a-z])/g, (_, f, l) => (f ? f.toUpperCase() : '-' + l.toUpperCase()))
}

export default class Headers {
  private headers: Record<string, stringable[]> = {}
  /** Get the first value that has the spcified header has */
  get(name: string): string | undefined {
    const values = this.headers[name.toLowerCase()]
    if (values === undefined) return undefined
    if (typeof values[0] === 'string') return values[0]
    return values[0].toString()
  }
  /** Get all values that are accociated with the spcified header, or undefined if none exist */
  getAll(name: string): string[] | undefined {
    const values = this.headers[name.toLowerCase()]
    if (values === undefined) return undefined
    return values.map(it => (typeof it === 'string' ? it : it.toString()))
  }
  /** Checks if a particular header name exists. Case-insensitive. */
  has(name: string): boolean {
    return name.toLowerCase() in this.headers
  }
  /** Sets the value of a header to the specified value. */
  set(name: string, value: undefined | stringable | number | stringable[]): void
  /** Sets the value of a header to the specified value. */
  set(name: string, ...value: (undefined | stringable | number)[]): void
  set(name: string, ...value: (undefined | stringable | number | stringable[])[]): void {
    const values: (undefined | stringable | number)[] = value.length === 1 && Array.isArray(value[0]) ? value[0] : value
    this.headers[name.toLowerCase()] = (values.filter(it => it !== undefined) as (stringable | number)[]).map(it =>
      typeof it === 'number' ? '' + it : it
    )
  }
  /** Adds a value to a header, setting it if required. */
  add(name: string, value: undefined | stringable | number | stringable[]): void
  /** Adds a value to a header, setting it if required. */
  add(name: string, ...value: (undefined | stringable | number)[]): void
  add(name: string, ...value: (undefined | stringable | number | stringable[])[]): void {
    const values: (undefined | stringable | number)[] = value.length === 1 && Array.isArray(value[0]) ? value[0] : value
    const current = (this.headers[name.toLowerCase()] ??= [])
    current.push(
      ...(values.filter(it => it !== undefined) as (stringable | number)[]).map(it =>
        typeof it === 'number' ? '' + it : it
      )
    )
  }

  /** Get all keys and values as a list of entries. If a key has multiple values it will flatten them to one value each key value pair. */
  entries() {
    const res: [string, string][] = []

    for (const key in this.headers) {
      if (this.headers.hasOwnProperty(key)) {
        for (const value of this.headers[key]) {
          res.push([toHeaderName(key), typeof value === 'string' ? value : value.toString()])
        }
      }
    }

    return res
  }

  /** Get the representation of these headers as a JSON object. */
  toJSON() {
    const res: Record<string, string | string[]> = {}

    for (const key in this.headers) {
      if (this.headers.hasOwnProperty(key)) {
        const values = this.headers[key].map(it => (typeof it === 'string' ? it : it.toString()))
        if (values.length > 0) {
          res[toHeaderName(key)] = values.length === 1 ? values[0] : values
        }
      }
    }

    return res
  }

  /** Get the representation of these headrs as a string. */
  toString() {
    let str = ''

    for (const key in this.headers) {
      if (this.headers.hasOwnProperty(key)) {
        const values = this.headers[key].map(it => (typeof it === 'string' ? it : it.toString()))
        for (const value of values) {
          str += toHeaderName(key) + ': ' + value + '\r\n'
        }
      }
    }

    return str
  }

  /** Convert an object into a Headers object. */
  static from(object: Record<string, undefined | stringable | number | stringable[]> | undefined | null) {
    if (object === undefined || object === null) return new Headers()
    const headers = new Headers()
    for (const key in object) {
      if (object.hasOwnProperty(key)) {
        headers.set(key, object[key])
      }
    }
    return new Proxy(headers, {
      get(target, key) {
        if (typeof key === 'string' && headers.has(key)) return headers.get(key)
        return Reflect.get(target, key)
      },
      has(target, key) {
        if (typeof key === 'string' && headers.has(key)) return true
        return Reflect.has(target, key)
      },
    })
  }
}
