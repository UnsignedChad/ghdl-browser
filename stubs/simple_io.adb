--  Simple_IO wasm32 stub — uses grt.astdio (no Ada.Text_IO dependency).
with Grt.Astdio;
with Grt.Stdio; use Grt.Stdio;

package body Simple_IO is

   procedure Put (S : String) is
   begin
      Grt.Astdio.Put (S);
   end Put;

   procedure Put (C : Character) is
   begin
      Grt.Astdio.Put (C);
   end Put;

   procedure Put_Line (S : String) is
   begin
      Grt.Astdio.Put_Line (S);
   end Put_Line;

   procedure New_Line is
   begin
      Grt.Astdio.New_Line;
   end New_Line;

   procedure Put_Err (S : String) is
   begin
      Grt.Astdio.Put (Grt.Stdio.stderr, S);
   end Put_Err;

   procedure Put_Err (C : Character) is
   begin
      Grt.Astdio.Put (Grt.Stdio.stderr, C);
   end Put_Err;

   procedure Put_Line_Err (S : String) is
   begin
      Grt.Astdio.Put (Grt.Stdio.stderr, S);
      Grt.Astdio.New_Line (Grt.Stdio.stderr);
   end Put_Line_Err;

   procedure New_Line_Err is
   begin
      Grt.Astdio.New_Line (Grt.Stdio.stderr);
   end New_Line_Err;

end Simple_IO;
