type stringable = string | { toString(): string }

export default class QueryObject {
  private queryObject: Record<string, string[]> = {}
  /** Get the first value that has the spcified name, or use the default value */
  get(name: string, defaultValue?: string): string | undefined
  /** Get the first value that has the spcified name, or use the default value */
  get(name: string, defaultValue: string): string
  get(name: string, defaultValue?: string): string | undefined {
    const values = this.queryObject[name]
    if (values === undefined) return defaultValue
    return values[0] ?? defaultValue
  }
  /** Get all values that are accociated with the spcified name, or undefined if none exist */
  getAll(name: string): string[] | undefined {
    const values = this.queryObject[name]
    if (values === undefined) return undefined
    return values
  }
  /** Checks if a particular key name exists in the query string. */
  has(name: string): boolean {
    return name in this.queryObject
  }
  /** Sets the value of a key to the specified value. */
  set(name: string, value: undefined | stringable | number | stringable[]): void
  /** Sets the value of a key to the specified value. */
  set(name: string, ...value: (undefined | stringable | number)[]): void
  set(name: string, ...value: (undefined | stringable | number | stringable[])[]): void {
    const values: (undefined | stringable | number)[] = value.length === 1 && Array.isArray(value[0]) ? value[0] : value
    this.queryObject[name] = (values
      .filter(it => it !== undefined) as (stringable | number)[])
      .map(it => typeof it === 'string' ? it : typeof it === 'number' ? ''+it : it.toString())
  }
  /** Adds a value to a key, setting it if required. */
  add(name: string, value: undefined | stringable | number | stringable[]): void
  /** Adds a value to a key, setting it if required. */
  add(name: string, ...value: (undefined | stringable | number)[]): void
  add(name: string, ...value: (undefined | stringable | number | stringable[])[]): void {
    const values: (undefined | stringable | number)[] = value.length === 1 && Array.isArray(value[0]) ? value[0] : value
    const current = this.queryObject[name] ??= []
    current.push(...(values
      .filter(it => it !== undefined) as (stringable | number)[])
      .map(it => typeof it === 'string' ? it : typeof it === 'number' ? ''+it : it.toString()))
  }

  /** Get the value of a key as a number. */
  getAsNumber(name: string): number | undefined
  /** Get the value of a key as a number or return the default value. */
  getAsNumber(name: string, defaultValue: number): number
  getAsNumber(name: string, defaultValue?: number) {
    const value = this.get(name)
    if (value === undefined || isNaN(+value)) return defaultValue
    return +value
  }
  
  /** Get the value of a key as a number, but constrain it in a range. */
  getAsNumberInRange(name: string, min: number, max: number): number
  /** Get the value of a key as a number or the default value, but constrain the value in a range. */
  getAsNumberInRange(name: string, min: number, max: number, defaultValue: number): number
  getAsNumberInRange(name: string, min: number, max: number, defaultValue?: number) {
    return Math.max(Math.min(this.getAsNumber(name, defaultValue as number) ?? min, max), min)
  }

  /** Get all keys and values as a list of entries. If a key has multiple values it will flatten them to one value each key value pair. */
  entries() {
    const queryStringArr = []

    for (const key in this.queryObject) {
      if (this.queryObject.hasOwnProperty(key)) {
        for (const value of this.queryObject[key]) {
          queryStringArr.push([key, value])
        }
      }
    }

    return queryStringArr
  }

  /** Get the representation of this query string as a JSON object. */
  toJSON() {
    return this.queryObject
  }

  /** Get the representation of this query string as a string. */
  toString() {
    return this.entries().map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join('&')
  }

  /** Convert a string into a query object. */
  static from(string: string): QueryObject
  /** Convert an object into a query object. */
  static from(object: Record<string, undefined | stringable | number | stringable[]> | undefined | null): QueryObject
  static from(object: string | Record<string, undefined | stringable | number | stringable[]> | undefined | null) {
    if (object === undefined || object === null) return new QueryObject
    let entries = [] as [string, undefined | stringable | number | stringable[]][]
    if (typeof object === 'string') entries = object.split('&')
      .map(it => it.split('=').map(decodeURIComponent))
      .filter(([name]) => name !== '' && name !== undefined) as [string, string][]
    else entries = Object.entries(object)

    const query = new QueryObject
    for (const [name, value] of entries) {
      query.add(name, value)
    }
    return query
  }
}
