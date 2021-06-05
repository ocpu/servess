export interface CookieOptions {
  sameSite?: 'strict' | 'lax' | 'none'
  secure?: boolean
  httpOnly?: boolean
  domain?: string
  path?: string
  maxAge?: number | Date
  expires?: number | Date
}
export default class Cookie {
  private _value: string
  private _changed: boolean
  private _sameSite?: 'strict' | 'lax' | 'none'
  private _secure?: boolean
  private _httpOnly?: boolean
  private _domain?: string
  private _path?: string
  private _maxAge?: number | Date
  private _expires?: number | Date

  constructor(public readonly key: string, value: string, options?: CookieOptions) {
    this._value = value
    this._changed = false
    this._sameSite = Object(options).sameSite
    this._secure = Object(options).secure
    this._httpOnly = Object(options).httpOnly
    this._domain = Object(options).domain
    this._path = Object(options).path
    this._maxAge = Object(options).maxAge
    this._expires = Object(options).expires
  }

  private set<K extends keyof Cookie>(key: K, value: Cookie[K]) {
    if (!this._changed)
      //@ts-ignore
      this._changed = this['_' + key] !== value
    //@ts-ignore
    this['_' + key] = value
  }

  get changed() {
    return this._changed
  }
  get value() {
    return this._value
  }
  set value(value) {
    this.set('value', value)
  }
  get sameSite() {
    return this._sameSite || 'none'
  }
  set sameSite(sameSite) {
    this.set('sameSite', sameSite)
  }
  get secure() {
    return this._secure || false
  }
  set secure(secure) {
    this.set('secure', secure)
  }
  get httpOnly() {
    return this._httpOnly || false
  }
  set httpOnly(httpOnly) {
    this.set('httpOnly', httpOnly)
  }
  get domain() {
    return this._domain
  }
  set domain(domain) {
    this.set('domain', domain)
  }
  get path() {
    return this._path
  }
  set path(path) {
    this.set('path', path)
  }
  get maxAge() {
    return this._maxAge instanceof Date ? this._maxAge : new Date(this._maxAge || 0)
  }
  set maxAge(maxAge: number | Date) {
    this.set('maxAge', maxAge)
  }
  get expires() {
    return this._expires instanceof Date ? this._expires : new Date(this._expires || 0)
  }
  set expires(expires: number | Date) {
    this.set('expires', expires)
  }

  toString() {
    let base = this.key + '=' + encodeURIComponent(this.value)
    if (this._sameSite) base += '; SameSite=' + this._sameSite[0].toUpperCase() + this._sameSite.slice(1)
    if (this._secure) base += '; Secure'
    if (this._httpOnly) base += '; HttpOnly'
    if (this._domain) base += '; Domain=' + this._domain
    if (this._path) base += '; Path=' + this._path
    if (this._maxAge) base += '; Max-Age=' + this._maxAge.valueOf()
    if (this._expires) base += '; Expires=' + new Date(this._expires).toString()
    return base
  }

  static parse(cookie: string): Cookie {
    const meta: {
      sameSite?: 'strict' | 'lax' | 'none'
      secure?: boolean
      httpOnly?: boolean
      domain?: string
      path?: string
      maxAge?: number | Date
      expires?: number | Date
    } = {}
    const items = cookie.split(/ *; */g)
    const keyPair = items.shift()
    if (!keyPair) throw new Error('Invalid cookie string')
    const [key, value] = keyPair.trim().split('=')
    items.forEach(item => {
      const value = item.trim()
      if (value.startsWith('SameSite=')) meta.sameSite = value.slice(9).toLowerCase() as 'strict' | 'lax' | 'none'
      if (value === 'Secure') meta.secure = true
      if (value === 'HttpOnly') meta.httpOnly = true
      if (value.startsWith('Domain=')) meta.domain = value.slice(7)
      if (value.startsWith('Path=')) meta.path = value.slice(5)
      if (value.startsWith('Max-Age=')) meta.maxAge = new Date(+value.slice(8))
      if (value.startsWith('Expires=')) meta.expires = new Date(value.slice(8))
    })
    return new Cookie(key, decodeURIComponent(value), meta)
  }
}
