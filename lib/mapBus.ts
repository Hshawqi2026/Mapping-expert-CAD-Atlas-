import { LatLng } from '../types';

type Listener = (coords: LatLng[]) => void;

let listeners: Listener[] = [];

export function focusOnMap(coords: LatLng[]) {
  listeners.forEach((l) => l(coords));
}

export function subscribeFocus(cb: Listener) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}
