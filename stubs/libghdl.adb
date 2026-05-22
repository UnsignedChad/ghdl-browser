--  Libghdl wasm32 stub body.
--  Full implementation of the driver units is excluded from the wasm build.
--  These stubs allow the spec to compile; actual behavior will be wired
--  via JS imports in a later pass.
with Libraries;
with Errorout;
with Files_Map;
with Vhdl.Sem_Lib;

package body Libghdl is

   procedure Set_Hooks_For_Analysis is
   begin
      null;
   end Set_Hooks_For_Analysis;

   function Set_Option (Opt : Thin_String_Ptr; Len : Natural) return Integer is
      pragma Unreferenced (Opt, Len);
   begin
      return 0;
   end Set_Option;

   procedure Set_Exec_Prefix (Prefix : Thin_String_Ptr; Len : Natural) is
      pragma Unreferenced (Prefix, Len);
   begin
      null;
   end Set_Exec_Prefix;

   function Analyze_Init_Status return Integer is
   begin
      declare Dummy : Boolean; begin Dummy := Libraries.Load_Std_Library; end;
      return 0;
   end Analyze_Init_Status;

   procedure Analyze_Init is
   begin
      declare Dummy : Boolean; begin Dummy := Libraries.Load_Std_Library; end;
   end Analyze_Init;

   function Analyze_File (File : Thin_String_Ptr; Len : Natural) return Iir is
      pragma Unreferenced (File, Len);
   begin
      return Vhdl.Nodes.Null_Iir;
   end Analyze_File;

end Libghdl;
