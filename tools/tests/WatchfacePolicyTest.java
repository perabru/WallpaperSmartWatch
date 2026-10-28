package br.com.perabru.raccoonstudio;

/** Host tests for decisions that precede device writes. No BLE/native execution. */
public final class WatchfacePolicyTest {
    private static int assertions;

    public static void main(String[] args) {
        require(JieliWatchfaceService.validScreen(240, 284), "rectangular screen");
        require(JieliWatchfaceService.validScreen(454, 454), "square screen");
        require(JieliWatchfaceService.validScreen(64, 1024), "accepted bounds");
        require(!JieliWatchfaceService.validScreen(0, 454), "absent width");
        require(!JieliWatchfaceService.validScreen(454, -1), "negative height");
        require(!JieliWatchfaceService.validScreen(63, 454), "implausibly small width");
        require(!JieliWatchfaceService.validScreen(454, 1025), "memory bound");

        equal(0, JieliWatchfaceService.selectConversion(8, false), "695 RGB");
        equal(0, JieliWatchfaceService.selectConversion(8, true), "695 has no alpha variant");
        equal(1, JieliWatchfaceService.selectConversion(9, false), "701 RGB");
        equal(2, JieliWatchfaceService.selectConversion(9, true), "701 expanded display");
        equal(5, JieliWatchfaceService.selectConversion(13, false), "707 RGB");
        equal(6, JieliWatchfaceService.selectConversion(13, true), "707 expanded display");
        for (int chipset = -1; chipset <= 255; chipset++) {
            if (chipset == 8 || chipset == 9 || chipset == 13) continue;
            equal(-1, JieliWatchfaceService.selectConversion(chipset, false), "unknown chipset " + chipset);
            equal(-1, JieliWatchfaceService.selectConversion(chipset, true), "unknown alpha chipset " + chipset);
        }

        equal("bgp_w000", JieliWatchfaceService.backgroundName("/WATCH0", "null"), "legacy index zero");
        equal("bgp_w009", JieliWatchfaceService.backgroundName("/watch9", null), "legacy padded index");
        equal("bgp_w123", JieliWatchfaceService.backgroundName("WATCH123", "/null"), "three digit index");
        equal("bgp_w007", JieliWatchfaceService.backgroundName("/WATCH2", "/BGP_W007"), "reuse reported binding");
        equal(null, JieliWatchfaceService.backgroundName("/WATCH1000", "null"), "unsupported index");
        equal(null, JieliWatchfaceService.backgroundName("/RESOURCE", "null"), "no resource overwrite");
        equal(null, JieliWatchfaceService.backgroundName("/WATCH001", "/firmware.bin"), "reject foreign binding");
        equal(null, JieliWatchfaceService.backgroundName(null, null), "missing dial");
        equal(null, JieliWatchfaceService.backgroundName("/WATCHabc", "null"), "invalid index");

        require(JieliWatchfaceService.samePath("BGP_W007", "/bgp_w007"), "FAT path normalization");
        require(!JieliWatchfaceService.samePath("/BGP_W007", "/BGP_W008"), "wrong file binding");
        require(!JieliWatchfaceService.samePath(null, "/BGP_W007"), "missing device response");
        require(!JieliWatchfaceService.samePath("/folder/../BGP_W007", "/BGP_W007"), "no traversal normalization");
        System.out.println("Watchface policy checks passed: " + assertions + " assertions. BLE/native runtime not tested.");
    }

    private static void require(boolean condition, String label) {
        assertions++;
        if (!condition) throw new AssertionError(label);
    }

    private static void equal(Object expected, Object actual, String label) {
        require(expected == null ? actual == null : expected.equals(actual),
                label + ": expected " + expected + ", got " + actual);
    }
}
