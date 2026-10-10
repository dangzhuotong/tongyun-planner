/// <reference types="vite/client" />

interface ErrorOptions {
  cause?: unknown;
}

interface ErrorConstructor {
  new (message?: string, options?: ErrorOptions): Error;
  (message?: string, options?: ErrorOptions): Error;
}

declare module "lunar-javascript" {
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar;
    getLunar(): Lunar;
  }
  export class Lunar {
    getYearInChinese(): string;
    getMonthInChinese(): string;
    getDayInChinese(): string;
    toFullString(): string;
  }
  const lunar: {
    Solar: typeof Solar;
    Lunar: typeof Lunar;
  };
  export = lunar;
}
