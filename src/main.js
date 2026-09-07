import "./style.css";
import { GameManager } from "./core/GameManager.js";
try {
  const game = new GameManager(document.getElementById("battlefield"));
  if (import.meta.env.DEV) {
    window.__TANK_GAME__ = game;
    window.__THREE_GAME_DIAGNOSTICS__ = () => game.snapshot();
  }
} catch (error) {
  console.error(error);
  const overlay = document.getElementById("overlay");
  overlay.hidden = false;
  document.getElementById("overlay-title").textContent = "战场初始化失败";
  document.getElementById("overlay-copy").textContent =
    "请使用支持 WebGL 2 的现代浏览器，并开启硬件加速后刷新页面。";
  const button = document.getElementById("primary-btn");
  button.textContent = "重新加载";
  button.onclick = () => location.reload();
}
