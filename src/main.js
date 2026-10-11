import './style.css';
import { Game } from './game/Game.js';

const game = new Game(document.getElementById('app'));
game.init().catch((err) => {
  console.error(err);
  const t = document.getElementById('load-text');
  if (t) t.textContent = `Failed to load: ${err.message}. Run "npm run dev" from the project root.`;
});
// handy for debugging in the console
window.game = game;
