#!/bin/bash
# Drive single_test.mjs across all Stage 1 projects, one subprocess each.
SINGLE=/tmp/single_test.mjs
LOG=/tmp/batch_log.txt
SUMMARY=/tmp/batch_summary.txt
> "$LOG"
> "$SUMMARY"

PROJECTS=(
  "01_AND_GATE|AND_GATE.vhd|AND_GATE"
  "02_OR_GATE|OR_GATE.vhd|OR_GATE"
  "03_NOT_Gate|NOT_GATE.vhd|NOT_GATE"
  "04_NAND_Gate|NAND_GATE.vhd|NAND_GATE"
  "05_NOR_GATE|NOR_GATE.vhd|NOR_GATE"
  "06_XOR_GATE|XOR_GATE.vhd|XOR_GATE"
  "07_XNOR_GATE|XNOR_GATE.vhd|XNOR_GATE"
  "08_2to1_MUX|_2to1_MUX.vhd|MUX2to1"
  "09_4to1_MUX|_4to1_MUX.vhd|MUX4to1"
  "10_8to1_MUX|MUX8to1.vhd|MUX8to1"
  "11_1to2_deMUX|deMUX1to2.vhd|deMUX1to2"
  "12_1to4_deMUX|deMUX1to4.vhd|deMUX1to4"
  "13_Decoder2to4|Decoder2to4.vhd|Decoder2to4"
  "14_Decoder3to8|Decoder3to8.vhd|Decoder3to8"
  "15_Priority_Encoder|PriorityEncoder8to3.vhd|PriorityEncoder8to3"
  "16_SevenSeg_Driver|sevenSeg.vhd|sevenSeg"
  "17_Binary_to_Gray_Code_Converter|BinaryToGray.vhd|BinaryToGray"
  "18_Gray_Code_to_Binary_Converter|GrayToBinary.vhd|GrayToBinary"
  "19_Comparator4Bit|Comparator4Bit.vhd|Comparator4Bit"
  "20_Comparator8Bit|Comparator8Bit.vhd|Comparator8Bit"
  "21_HalfAdder|HalfAdder.vhd|HalfAdder"
  "22_FullAdder|FullAdder.vhd|FullAdder"
  "23_Ripple_Carry_Adder_4_Bit|RCA4Bit.vhd|RCA4Bit"
  "24_Subtractor_4Bit|Subtractor_4Bit.vhd|Subtractor_4Bit"
  "25_Adder_Subtractor_4Bit|Adder_Subtractor_4Bit.vhd|Adder_Subtractor_4Bit"
  "26_CascadableNbitComparator|CascadableNbitComparator.vhd|CascadableNbitComparator"
)

PASS=0
FAIL=0
echo "─── VHDL-100-Projects Stage 1: full pipeline (subprocess per project) ───"
for p in "${PROJECTS[@]}"; do
  IFS='|' read -r dir file top <<< "$p"
  OUT=$(timeout 60 node "$SINGLE" "$dir" "$file" "$top" 2>>"$LOG")
  echo "$OUT" >> "$SUMMARY"
  STAGE=$(echo "$OUT" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('stage','?'))")
  OK=$(echo "$OUT" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('ok',False))")
  if [ "$OK" = "True" ]; then
    SIZE=$(echo "$OUT" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('wasmSize',0))")
    LINES=$(echo "$OUT" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('watLines',0))")
    printf "  ✓ %-40s  %sL  %sB\n" "$dir" "$LINES" "$SIZE"
    PASS=$((PASS+1))
  else
    ERR=$(echo "$OUT" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('err','?')[:60])")
    printf "  ✗ %s %-40s  %s\n" "$STAGE" "$dir" "$ERR"
    FAIL=$((FAIL+1))
  fi
done
echo
echo "━━ $PASS/${#PROJECTS[@]} pass  ($FAIL fail) ━━"
