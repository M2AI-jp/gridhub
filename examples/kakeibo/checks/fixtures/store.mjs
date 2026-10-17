process.argv.splice(2, 0, 'store');
await import('./backend.mjs');
