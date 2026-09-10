import { initManual } from './manual.js';

// The reference renders independently of account/network initialization.
initManual();
import('../src/ui/shell.js').then(({ mountShell }) => {
  mountShell({ page: 'info', base: '../' });
}).catch(error => console.error('Could not load the game header:', error));
