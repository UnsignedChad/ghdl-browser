package body Ada.Calendar is
   --  Epoch: 1970-01-01 00:00:00
   --  All stubs return fixed values for wasm32; real time not available.

   function Clock return Time is
   begin
      return Time (0.0);
   end Clock;

   function Year (Date : Time) return Year_Number is
      pragma Unreferenced (Date);
   begin return 1970; end Year;

   function Month (Date : Time) return Month_Number is
      pragma Unreferenced (Date);
   begin return 1; end Month;

   function Day (Date : Time) return Day_Number is
      pragma Unreferenced (Date);
   begin return 1; end Day;

   function Seconds (Date : Time) return Day_Duration is
      pragma Unreferenced (Date);
   begin return 0.0; end Seconds;

   procedure Split (Date    : Time;
                    Year    : out Year_Number;
                    Month   : out Month_Number;
                    Day     : out Day_Number;
                    Seconds : out Day_Duration) is
      pragma Unreferenced (Date);
   begin
      Year := 1970; Month := 1; Day := 1; Seconds := 0.0;
   end Split;

   function Time_Of (Year    : Year_Number;
                     Month   : Month_Number;
                     Day     : Day_Number;
                     Seconds : Day_Duration := 0.0) return Time is
      pragma Unreferenced (Year, Month, Day, Seconds);
   begin
      return Time (0.0);
   end Time_Of;

   function "+" (Left : Time; Right : Duration) return Time is
   begin return Time (Duration (Left) + Right); end "+";
   function "+" (Left : Duration; Right : Time) return Time is
   begin return Time (Left + Duration (Right)); end "+";
   function "-" (Left : Time; Right : Duration) return Time is
   begin return Time (Duration (Left) - Right); end "-";
   function "-" (Left : Time; Right : Time) return Duration is
   begin return Duration (Left) - Duration (Right); end "-";
   function "<" (Left, Right : Time) return Boolean is
   begin return Duration (Left) < Duration (Right); end "<";
   function "<="  (Left, Right : Time) return Boolean is
   begin return Duration (Left) <= Duration (Right); end "<=";
   function ">" (Left, Right : Time) return Boolean is
   begin return Duration (Left) > Duration (Right); end ">";
   function ">="  (Left, Right : Time) return Boolean is
   begin return Duration (Left) >= Duration (Right); end ">=";

end Ada.Calendar;
