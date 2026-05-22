--  Ghdlsynth wasm32 stub body — synthesis not wired in browser target.
with Netlists; use Netlists;

package body Ghdlsynth is

   procedure Register_Commands is
   begin null; end Register_Commands;

   procedure Init_For_Ghdl_Synth is
   begin null; end Init_For_Ghdl_Synth;

   function Ghdl_Synth
     (Init : Natural; Argc : Natural; Argv : C_String_Array_Acc)
     return Module
   is
      pragma Unreferenced (Init, Argc, Argv);
   begin
      return No_Module;
   end Ghdl_Synth;

end Ghdlsynth;
