--  Grt.Stdio body: Ada wrapper procedures discarding C int return values.
--  Needed for wasm32 where function signature must be consistent.
package body Grt.Stdio is
   procedure fputc (c : int; stream : FILEs) is
      Dummy : int;
      pragma Unreferenced (Dummy);
   begin
      Dummy := fputc (c, stream);  --  calls the function form
   end fputc;

   procedure fflush (stream : FILEs) is
      Dummy : int;
      pragma Unreferenced (Dummy);
   begin
      Dummy := fflush (stream);  --  calls the function form
   end fflush;

   procedure fclose (stream : FILEs) is
      Dummy : int;
      pragma Unreferenced (Dummy);
   begin
      Dummy := fclose (stream);  --  calls the function form
   end fclose;
end Grt.Stdio;
