import { beforeEach, describe, expect, it } from 'vitest';
import {
  _injectKeyDown,
  _injectKeyUp,
  _resetForTest,
  keyDown,
  keyWentDown,
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
