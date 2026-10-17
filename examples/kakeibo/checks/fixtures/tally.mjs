process.argv.splice(2, 0, 'tally');
await import('./backend.mjs');
