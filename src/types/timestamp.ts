export interface AppTimestamp {
  toDate(): Date;
}

class DateTimestamp implements AppTimestamp {
  constructor(private readonly value: Date) {}

  toDate(): Date {
    return new Date(this.value.getTime());
  }
}

export function timestampFromDate(value: Date): AppTimestamp {
  return new DateTimestamp(value);
}

export function timestampFromIso(value: string): AppTimestamp {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  return timestampFromDate(date);
}
