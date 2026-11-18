import './styles/app.css';
import { Game } from './core/Game';
import { mountSwAutoRefresh } from './platform/SwUpdater';

mountSwAutoRefresh();

const game = new Game();
game.start();
