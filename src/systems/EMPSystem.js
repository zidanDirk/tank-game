export const EMP = Object.freeze({
  radius: 4,
  cooldown: 12,
  stun: 2,
  bossStun: 0.45,
});

export function activateEMP(game) {
  const player = game.player;
  if (
    !(game.empAvailable?.() ?? game.mode === "endless") ||
    game.state !== "playing" ||
    !player?.alive ||
    game.empCooldownLeft > 0
  )
    return false;
  game.empCooldownLeft = EMP.cooldown;
  game.bullets.clearHostileInRadius(player.x, player.z, EMP.radius);
  for (const enemy of game.enemies) {
    if (
      !enemy.alive ||
      Math.hypot(enemy.x - player.x, enemy.z - player.z) > EMP.radius
    )
      continue;
    enemy.interruptAttack?.();
    const duration = enemy.type === "boss" ? EMP.bossStun : EMP.stun;
    enemy.frozenUntil = Math.max(enemy.frozenUntil ?? 0, game.time + duration);
  }
  game.effects.pulse(player.x, player.z, 0x56eee4, EMP.radius, 0.55);
  game.audio.play("emp");
  return true;
}
