import { render } from 'solid-js/web';
import { App } from './App';
import { registerPwa } from './pwa';
import { BOOT_MARK_DOM_READY, measureBootMark } from './metrics/boot';
import './styles.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found in index.html');
}

render(() => <App />, root);
measureBootMark(BOOT_MARK_DOM_READY);
void registerPwa();
