#!/usr/bin/env ./bootstrap.sh
import {$, spawn, file} from "bun";
import {copyFile} from "fs/promises";

process.env.FORCE_COLOR = "1";

export async function clean() {
    await $`rm -rf zig-out zig-cache .zig-cache`;
}

export async function build(...args: string[]) {
    // Default to ReleaseSmall for WASM size optimization
    const optimize = args.includes('-Doptimize=') ? [] : ['-Doptimize=ReleaseSmall'];
    await $`zig build ${optimize} ${args}`;

    // Copy built WASM to example directory
    const wasmPath = 'zig-out/bin/glulxe.wasm';
    const destPath = 'examples/jspi-browser/glulxe.wasm';
    if (await file(wasmPath).exists()) {
        await copyFile(wasmPath, destPath);
        console.log(`Copied ${wasmPath} -> ${destPath}`);
    }
}

export async function test(...args: string[]) {
    // Start the dev server in background (using Bun)
    const server = spawn({
        cmd: ['bun', 'run', 'examples/jspi-browser/serve.js'],
        stdout: 'inherit',
        stderr: 'inherit',
    });

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
        // Playwright's test runner requires Node - bunx has compatibility issues
        await $`npx playwright test --config=examples/jspi-browser/playwright.config.js ${args}`;
    } finally {
        server.kill();
    }
}

// Run tests with browser visible (useful for debugging)
export async function testHeaded(...args: string[]) {
    await test('--headed', ...args);
}

export async function serve() {
    await $`bun run examples/jspi-browser/serve.js`;
}

export async function ci() {
    await clean();
    await build();
    await test();
}

const command = process.argv[2] || 'build';
const args = process.argv.slice(3);

try {
    await eval(command)(...args);
} catch (e: any) {
    if (e instanceof ReferenceError) {
        const { exitCode } = await $`${command} ${args}`.nothrow();
        process.exit(exitCode);
    } else {
        console.error('Command failed:', command, ...args, e.message);
        process.exit(1);
    }
}
