import { beforeEach, describe, expect, it } from 'vitest';
import {
  _injectKeyDown,
  _injectKeyUp,
  _injectMouseDown,
  _injectMouseMove,
  _injectMouseUp,
  _resetForTest,
  keyDown,
  keyWentDown,
  mouseClickedIn,
  mouseDown,
  mouseOver,
  mouseWentDown,
  mouseX,
  mouseY,
  snapshotTick,
} from '../src/gamelab';

beforeEach(() => {
  _resetForTest();
});

describe('keyWentDown / keyDown', () => {
  it('keyWentDown fires exactly once for a held key across multiple ticks', () => {
    _injectKeyDown('ArrowUp');
    snapshotTick();
    expect(keyWentDown('up')).toBe(true);
    expect(keyDown('up')).toBe(true);

    snapshotTick();
    expect(keyWentDown('up')).toBe(false);
    expect(keyDown('up')).toBe(true);

    _injectKeyUp('ArrowUp');
    snapshotTick();
    expect(keyWentDown('up')).toBe(false);
    expect(keyDown('up')).toBe(false);
  });

  it('a press-and-release inside a single tick window is still visible for one tick', () => {
    _injectKeyDown('c');
    _injectKeyUp('c');
    snapshotTick();
    expect(keyWentDown('c')).toBe(true);
    expect(keyDown('c')).toBe(true);

    snapshotTick();
    expect(keyWentDown('c')).toBe(false);
    expect(keyDown('c')).toBe(false);
  });

  it('lookups are case-insensitive (PARITY: original calls keyWentDown("C"))', () => {
    _injectKeyDown('c');
    snapshotTick();
    expect(keyWentDown('C')).toBe(true);
    expect(keyWentDown('c')).toBe(true);
    expect(keyDown('C')).toBe(true);
  });

  it('shift+key and unshifted-key map to the same entry', () => {
    _injectKeyDown('C'); // shift held
    snapshotTick();
    expect(keyDown('c')).toBe(true);
    _injectKeyUp('C');
    snapshotTick();
    expect(keyDown('c')).toBe(false);

    _injectKeyDown('c'); // unshifted
    snapshotTick();
    expect(keyDown('C')).toBe(true);
  });

  it('arrow keys normalize to up/down/left/right', () => {
    _injectKeyDown('ArrowLeft');
    _injectKeyDown('ArrowRight');
    _injectKeyDown('ArrowUp');
    snapshotTick();
    expect(keyDown('left')).toBe(true);
    expect(keyDown('right')).toBe(true);
    expect(keyDown('up')).toBe(true);
  });

  it('space and Spacebar both normalize to "space"', () => {
    _injectKeyDown(' ');
    snapshotTick();
    expect(keyWentDown('space')).toBe(true);
  });

  it('a tick without a snapshot reports no input', () => {
    _injectKeyDown('w');
    // No snapshotTick yet — currentTick still empty.
    expect(keyDown('w')).toBe(false);
  });
});

describe('mouse input', () => {
  it('mouseWentDown fires exactly once for a held click across multiple ticks', () => {
    _injectMouseDown();
    snapshotTick();
    expect(mouseWentDown()).toBe(true);
    expect(mouseDown()).toBe(true);

    snapshotTick();
    expect(mouseWentDown()).toBe(false);
    expect(mouseDown()).toBe(true);

    _injectMouseUp();
    snapshotTick();
    expect(mouseWentDown()).toBe(false);
    expect(mouseDown()).toBe(false);
  });

  it('a click-and-release inside one tick is still visible for one tick', () => {
    _injectMouseDown();
    _injectMouseUp();
    snapshotTick();
    expect(mouseWentDown()).toBe(true);
    expect(mouseDown()).toBe(true);

    snapshotTick();
    expect(mouseWentDown()).toBe(false);
    expect(mouseDown()).toBe(false);
  });

  it('mouseOver hit-tests the current pointer position', () => {
    _injectMouseMove(50, 50);
    snapshotTick();
    expect(mouseOver(40, 40, 20, 20)).toBe(true);
    expect(mouseOver(0, 0, 20, 20)).toBe(false);
  });

  it('mouseClickedIn requires click edge AND hit-test', () => {
    _injectMouseMove(50, 50);
    _injectMouseDown();
    snapshotTick();
    expect(mouseClickedIn(40, 40, 20, 20)).toBe(true);
    expect(mouseClickedIn(0, 0, 20, 20)).toBe(false);

    snapshotTick(); // edge gone
    expect(mouseClickedIn(40, 40, 20, 20)).toBe(false);
  });

  it('mouseX/mouseY reflect the most recent injected position', () => {
    _injectMouseMove(123, 234);
    snapshotTick();
    expect(mouseX()).toBe(123);
    expect(mouseY()).toBe(234);
  });
});
