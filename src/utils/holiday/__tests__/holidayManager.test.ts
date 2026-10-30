import { describe, it, expect } from "vitest";
import { resolveDayHolidayMeta, getRegionIcalUrl } from "../holidayManager";
import { HOLIDAY_REGIONS, getRegionOption, isHolidayRegion } from "../regions";

describe("holidayManager (节假日与调休开关决策)", () => {
  describe("当开关开启时 (showHolidays: true)", () => {
    it("正确展示法定节假日「休」", () => {
      // 2026-10-01 是周四，国庆节
      const meta = resolveDayHolidayMeta("2026-10-01", { showHolidays: true });
      expect(meta.type).toBe("休");
      expect(meta.label).toBe("休");
      expect(meta.name).toBe("国庆节");
      expect(meta.isWeekend).toBe(false);
    });

    it("正确展示调休补班「班」", () => {
      // 2026-10-10 是周六，国庆节后补班
      const meta = resolveDayHolidayMeta("2026-10-10", { showHolidays: true });
      expect(meta.type).toBe("班");
      expect(meta.label).toBe("班");
      expect(meta.name).toBe("国庆调休");
      expect(meta.isWeekend).toBe(true);
    });

    it("普通周末与普通工作日不展示休班标签", () => {
      // 2026-03-14 是周六，非节假日
      const sat = resolveDayHolidayMeta("2026-03-14", { showHolidays: true });
      expect(sat.type).toBe("weekend");
      expect(sat.label).toBe("");

      // 2026-03-17 是周二，普通工作日
      const tue = resolveDayHolidayMeta("2026-03-17", { showHolidays: true });
      expect(tue.type).toBe("workday");
      expect(tue.label).toBe("");
    });

    it("支持自定义 iCal 年表覆盖内置数据", () => {
      const custom = {
        "2026-07-01": { type: "休" as const, name: "香港公众假期" },
      };
      const meta = resolveDayHolidayMeta("2026-07-01", {
        showHolidays: true,
        customHolidays: custom,
      });
      expect(meta.type).toBe("休");
      expect(meta.name).toBe("香港公众假期");
    });
  });

  describe("当开关关闭时 (showHolidays: false)", () => {
    it("法定节假日不显示「休」，工作日变回常规工作日", () => {
      // 2026-10-01 本是国庆节（周四），关闭后不显示休，作为普通工作日
      const meta = resolveDayHolidayMeta("2026-10-01", { showHolidays: false });
      expect(meta.type).toBe("workday");
      expect(meta.label).toBe("");
      expect(meta.name).toBe("");
    });

    it("调休补班不显示「班」，周六日变回常规周末", () => {
      // 2026-10-10 本是国庆补班（周六），关闭后不显示班，恢复为常规周末
      const meta = resolveDayHolidayMeta("2026-10-10", { showHolidays: false });
      expect(meta.type).toBe("weekend");
      expect(meta.label).toBe("");
      expect(meta.name).toBe("周末");
    });

    it("普通工作日和常规周末都不显示休班标签", () => {
      const wed = resolveDayHolidayMeta("2026-03-18", { showHolidays: false });
      expect(wed.type).toBe("workday");
      expect(wed.label).toBe("");

      const sun = resolveDayHolidayMeta("2026-03-15", { showHolidays: false });
      expect(sun.type).toBe("weekend");
      expect(sun.label).toBe("");
    });

    it("开关关闭时 iCal 自定义数据同样不显示", () => {
      const custom = {
        "2026-07-01": { type: "休" as const, name: "香港公众假期" },
      };
      const meta = resolveDayHolidayMeta("2026-07-01", {
        showHolidays: false,
        customHolidays: custom,
      });
      expect(meta.type).toBe("workday");
      expect(meta.label).toBe("");
    });
  });

  describe("地区切换 (region)", () => {
    it("内地地区用内置年表，命中法定节假日", () => {
      const meta = resolveDayHolidayMeta("2026-10-01", { region: "cn" });
      expect(meta.type).toBe("休");
      expect(meta.name).toBe("国庆节");
    });

    it("香港地区不套用内地年表，内地独有的连休假不显示为「休」", () => {
      // 2026-10-02 是周五，内地黄金周为「休」，香港为正常工作日
      const meta = resolveDayHolidayMeta("2026-10-02", { region: "hk" });
      expect(meta.type).toBe("workday");
      expect(meta.label).toBe("");
    });

    it("香港地区在没有 iCal 数据时只保留周末「休」", () => {
      // 2026-10-10 是周六
      const meta = resolveDayHolidayMeta("2026-10-10", { region: "hk" });
      expect(meta.type).toBe("weekend");
      expect(meta.label).toBe("");
    });

    it("香港地区即使无自定义 iCal，也能直接走内置法定公众假期年表", () => {
      // 2026-10-01 是国庆日
      const meta = resolveDayHolidayMeta("2026-10-01", {
        region: "hk",
        showHolidays: true,
      });
      expect(meta.type).toBe("休");
      expect(meta.name).toBe("国庆日");

      // 2026-10-19 是重阳节翌日
      const chungYeung = resolveDayHolidayMeta("2026-10-19", {
        region: "hk",
        showHolidays: true,
      });
      expect(chungYeung.type).toBe("休");
      expect(chungYeung.name).toBe("重阳节翌日");

      // 2026-10-02 是周五，香港无黄金周调休，为正常工作日
      const normalWorkday = resolveDayHolidayMeta("2026-10-02", {
        region: "hk",
        showHolidays: true,
      });
      expect(normalWorkday.type).toBe("workday");
      expect(normalWorkday.label).toBe("");
    });

    it("香港地区有自定义 iCal 订阅数据时覆盖内置数据", () => {
      const custom = {
        "2026-10-01": { type: "休" as const, name: "自定义节日" },
      };
      const meta = resolveDayHolidayMeta("2026-10-01", {
        region: "hk",
        customHolidays: custom,
      });
      expect(meta.type).toBe("休");
      expect(meta.name).toBe("自定义节日");
    });
  });

  describe("地区定义", () => {
    it("内地与香港均支持内置离线年表", () => {
      expect(getRegionIcalUrl("cn")).toBe("");
      expect(getRegionOption("cn").builtin).toBe(true);
      expect(getRegionOption("hk").builtin).toBe(true);
    });

    it("香港同时提供 1823 官方 iCal 订阅同步地址", () => {
      expect(getRegionIcalUrl("hk")).toContain("1823.gov.hk");
    });

    it("提供内地与香港两个地区", () => {
      expect(HOLIDAY_REGIONS.map((r) => r.id)).toEqual(["cn", "hk"]);
    });

    it("isHolidayRegion 只接受已知地区", () => {
      expect(isHolidayRegion("cn")).toBe(true);
      expect(isHolidayRegion("hk")).toBe(true);
      expect(isHolidayRegion("jp")).toBe(false);
      expect(isHolidayRegion(undefined)).toBe(false);
    });
  });
});
