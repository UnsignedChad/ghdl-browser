--  Synthesis wasm32 stub — not available in browser target.
with Netlists; use Netlists;
with Elab.Vhdl_Context; use Elab.Vhdl_Context;

package body Synthesis is

   function Synth_Design (Design : Iir;
                          Inst : Synth_Instance_Acc;
                          Encoding : Name_Encoding) return Base_Instance_Acc is
      pragma Unreferenced (Design, Inst, Encoding);
   begin
      return null;
   end Synth_Design;

   procedure Instance_Passes (Ctxt : Context_Acc; M : Module) is
      pragma Unreferenced (Ctxt, M);
   begin null; end Instance_Passes;

end Synthesis;
