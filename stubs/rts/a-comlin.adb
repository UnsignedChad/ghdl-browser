package body Ada.Command_Line is
   function Argument_Count return Natural is
   begin
      return 0;
   end Argument_Count;
   function Argument (Number : Positive) return String is
      pragma Unreferenced (Number);
   begin
      return "";
   end Argument;
   function Command_Name return String is
   begin
      return "ghdl";
   end Command_Name;
end Ada.Command_Line;
