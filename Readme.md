# Servess

This is yet another routing library that takes some insperation from express and ktor. The module itself is a router with extension hooks. All routes are async.

A small example
```typescript
import createApp from 'servess'

void async function main() {
  const app = createApp()

  app.get('/', () => 'Hello, world!')

  await app.listen(3000)
  console.log('> Listening: http://localhost:3000')
}()
```

Content negotiation
```typescript
app.get('/', ctx => ctx.accepting({
  html: () => {
    ctx.setHeader('Content-Type', 'html')
    return `<p>Hello, world!</p>`
  },
  json: () => ctx.json({ hello: 'world' }),
  else: () => 'Hello, world'
}))
```

Extensions
```typescript
import createApp from 'servess'
// Type 1 static import
import Templating from 'servess-tmpl'

void async function main() {
  const app = createApp()

  app.install(Templating)
  // Type 2 dynamic import
  app.install(import('servess-ws'))

  await app.listen(3000)
  console.log('> Listening: http://localhost:3000')
}()
```
