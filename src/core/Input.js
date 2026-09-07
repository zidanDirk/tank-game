import * as THREE from "three";
const keys = {
  KeyW: 0,
  ArrowUp: 0,
  KeyD: 1,
  ArrowRight: 1,
  KeyS: 2,
  ArrowDown: 2,
  KeyA: 3,
  ArrowLeft: 3,
};
export class Input {
  constructor(game, canvas) {
    this.game = game;
    this.keys = new Map();
    this.firing = false;
    this.mouseAim = false;
    this.target = null;
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hit = new THREE.Vector3();
    this.touch = new Map();
    window.addEventListener("keydown", (e) => {
      if (
        e.target instanceof HTMLElement &&
        e.target.matches("input,textarea,select")
      )
        return;
      if (e.code in keys || e.code === "Space") e.preventDefault();
      game.audio.unlock();
      if (e.code in keys) {
        this.keys.set(e.code, keys[e.code]);
        if (!e.repeat) this.mouseAim = false;
      }
      if (e.code === "Space") this.firing = true;
      if (!e.repeat && (e.code === "KeyP" || e.code === "Escape"))
        game.togglePause();
      if (!e.repeat && e.code === "KeyR") game.restart();
      if (!e.repeat && e.code === "Enter" && game.state === "ready")
        game.start();
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === "Space") this.firing = false;
    });
    window.addEventListener("blur", () => {
      this.clear();
      if (game.state === "playing") game.togglePause();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.clear();
        if (game.state === "playing") game.togglePause();
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      const r = canvas.getBoundingClientRect();
      this.ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          (-(e.clientY - r.top) / r.height) * 2 + 1,
        ),
        game.camera,
      );
      if (this.ray.ray.intersectPlane(this.plane, this.hit)) {
        this.target = { x: this.hit.x, z: this.hit.z };
        this.mouseAim = true;
      }
    });
    canvas.addEventListener("pointerdown", (e) => {
      game.audio.unlock();
      if (e.button === 0 && e.pointerType !== "touch") {
        this.firing = true;
        canvas.setPointerCapture(e.pointerId);
      }
    });
    const release = () => {
      this.firing = false;
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    for (const button of document.querySelectorAll("[data-control]")) {
      const action = button.dataset.control;
      button.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        game.audio.unlock();
        button.setPointerCapture(e.pointerId);
        this.touch.set(e.pointerId, action);
        this.applyTouch();
        button.classList.add("pressed");
      });
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
        button.addEventListener(event, (e) => {
          this.touch.delete(e.pointerId);
          this.applyTouch();
          button.classList.remove("pressed");
        });
    }
  }
  applyTouch() {
    for (const key of [...this.keys.keys()])
      if (key.startsWith("touch")) this.keys.delete(key);
    this.firing = [...this.touch.values()].includes("fire");
    for (const [id, action] of this.touch) {
      const dir = { up: 0, right: 1, down: 2, left: 3 }[action];
      if (dir !== undefined) {
        this.keys.set("touch" + id, dir);
        this.mouseAim = false;
      }
    }
  }
  get direction() {
    const vals = [...this.keys.values()];
    return vals.length ? vals[vals.length - 1] : null;
  }
  clear() {
    this.keys.clear();
    this.touch.clear();
    this.firing = false;
    for (const el of document.querySelectorAll(".pressed"))
      el.classList.remove("pressed");
  }
}
