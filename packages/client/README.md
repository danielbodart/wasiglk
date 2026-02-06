# @bodar/wasiglk

Interactive Fiction interpreters compiled to WebAssembly with Zig. Run classic
text adventures in the browser via Web Workers and JSPI.

## Usage

```typescript
import { createClient } from '@bodar/wasiglk';

const client = await createClient({
  storyUrl: '/stories/adventure.gblorb',
  workerUrl: '/worker.js',
});

for await (const update of client.updates({ width: 80, height: 24 })) {
  switch (update.type) {
    case 'content':
      for (const span of update.content) {
        if (span.type === 'text') process.stdout.write(span.text ?? '');
      }
      break;
    case 'input-request':
      client.sendInput('look');
      break;
    case 'window':
      break;
  }
}

client.stop();
```

## Included WASM Interpreters

The package bundles optimized WASM binaries for these Interactive Fiction formats:

| Interpreter | Format | Extensions |
|-------------|--------|------------|
| Glulxe | Glulx | .ulx, .gblorb |
| Git | Glulx | .ulx, .gblorb |
| Fizmo | Z-machine (v1-5, 7, 8) | .z1-.z8, .zblorb |
| Hugo | Hugo | .hex |
| TADS 2 | TADS 2 | .gam |
| TADS 3 | TADS 3 | .t3 |
| Scare | ADRIFT | .taf |
| Agility | AGT | .agx |
| Alan 2 | Alan 2 | .acd |
| Alan 3 | Alan 3 | .a3c |
| AdvSys | AdvSys | .dat |
| JACL | JACL | .j2 |
| Level 9 | Level 9 | .l9, .sna |
| Magnetic | Magnetic Scrolls | .mag |
| Scott | Scott Adams | .saga |
| Plus | Scott Adams Plus | .sagaplus |
| Taylor | Adventure Int'l UK | .taylor |

## File Storage

Configure how save files are persisted:

```typescript
const client = await createClient({
  storyUrl: '/stories/adventure.gblorb',
  workerUrl: '/worker.js',
  filesystem: 'auto', // 'auto' | 'opfs' | 'memory' | 'dialog'
});
```

| Mode | Description |
|------|-------------|
| `'auto'` | (Default) Uses OPFS if available, falls back to in-memory |
| `'opfs'` | Origin Private File System - persistent across reloads |
| `'memory'` | In-memory only - lost when page closes |
| `'dialog'` | Native file dialogs for save/restore, OPFS for other files |

## Browser Support

- Chrome 131+: JSPI enabled by default
- Firefox: Enable `javascript.options.wasm_js_promise_integration` in `about:config`

## License

MIT
