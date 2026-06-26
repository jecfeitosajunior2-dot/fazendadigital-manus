let dbAvailable = true;

export function isDbAvailable(): boolean {
  return dbAvailable;
}

export function setDbAvailable(available: boolean): void {
  dbAvailable = available;
}
