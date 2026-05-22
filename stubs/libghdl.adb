pragma Suppress (All_Checks);
--  Libghdl wasm32 stub body — calls real init chain.
with Options;
with Libraries;
with Name_Table; use Name_Table;
with Flags;
with Vhdl.Sem_Lib;
with Vhdl.Canon;
with Vhdl.Nodes;
with Errorout;

with Translation;
with Ortho_Wasm;
with Simple_IO;
with Vhdl.Configuration;

package body Libghdl is

   Lib_Prefix     : Thin_String_Ptr := null;
   Lib_Prefix_Len : Natural         := 0;

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
   begin
      Lib_Prefix     := Prefix;
      Lib_Prefix_Len := Len;
   end Set_Exec_Prefix;

   function Analyze_Init_Status return Integer is
      Ok : Boolean;
   begin
      Options.Initialize;
      Flags.Flag_Elaborate               := True;
      Flags.Flag_Elaborate_With_Outdated := True;
      Flags.Flag_Only_Elab_Warnings      := False;
      --  Ensure canon assigns sequential P0/P1/... labels to unlabeled
      --  concurrent statements (processes / sigassigns).  Without this,
      --  Translate_Process_Declarations gives every unlabeled process the
      --  same name and they collide in the WAT.
      Vhdl.Canon.Canon_Flag_Add_Labels := True;
      if Lib_Prefix /= null and then Lib_Prefix_Len > 0 then
         declare
            Path : constant String :=
              Lib_Prefix (1 .. Lib_Prefix_Len) & "/lib/ghdl/";
         begin
            Libraries.Add_Library_Path (Path);
         end;
      end if;
      Ok := Libraries.Load_Std_Library;
      if not Ok then
         return -1;
      end if;
      Libraries.Load_Work_Library (True);
      return 0;
   end Analyze_Init_Status;

   procedure Analyze_Init is
   begin
      if Analyze_Init_Status /= 0 then
         null;
      end if;
   end Analyze_Init;

   function Analyze_File (File : Thin_String_Ptr; Len : Natural) return Iir is
      Id : Name_Id;
      Df : Iir;
      Unit, Next_Unit : Iir;
   begin
      Id := Get_Identifier (File (1 .. Len));
      Df := Vhdl.Sem_Lib.Load_File_Name (Id);
      if Df = Vhdl.Nodes.Null_Iir then
         return Vhdl.Nodes.Null_Iir;
      end if;

      --  Semantically analyse each design unit and add it to the work library
      --  so subsequent Configure / Elaborate can find it.
      Unit := Vhdl.Nodes.Get_First_Design_Unit (Df);
      while Unit /= Vhdl.Nodes.Null_Iir loop
         Next_Unit := Vhdl.Nodes.Get_Chain (Unit);
         Vhdl.Sem_Lib.Finish_Compilation (Unit, False);
         if Errorout.Nbr_Errors = 0 then
            Vhdl.Nodes.Set_Chain (Unit, Vhdl.Nodes.Null_Iir);
            Libraries.Add_Design_Unit_Into_Library (Unit);
         end if;
         Unit := Next_Unit;
      end loop;
      return Df;
   end Analyze_File;


   function Compile_Elab
     (Primary_Ptr : Thin_String_Ptr; Primary_Len : Natural;
      Secondary_Ptr : Thin_String_Ptr; Secondary_Len : Natural) return Integer
   is
      Primary_Id   : Types.Name_Id;
      Secondary_Id : Types.Name_Id;
      Work_Id      : Types.Name_Id;
      Config       : Iir;
   begin
      Primary_Id := Name_Table.Get_Identifier
        (Primary_Ptr (1 .. Primary_Len));
      if Secondary_Len > 0 then
         Secondary_Id := Name_Table.Get_Identifier
           (Secondary_Ptr (1 .. Secondary_Len));
      else
         Secondary_Id := Types.Null_Identifier;
      end if;
      Work_Id := Libraries.Work_Library_Name;

      Simple_IO.Put_Line_Err ("CE: pre-Configure");
      Config := Vhdl.Configuration.Configure
        (Work_Id, Primary_Id, Secondary_Id);
      Simple_IO.Put_Line_Err ("CE: post-Configure");
      if Config = Vhdl.Nodes.Null_Iir then
         Simple_IO.Put_Line_Err ("CE: Configure returned Null_Iir");
         return -1;
      end if;

      Simple_IO.Put_Line_Err ("CE: Ortho_Wasm.Init");
      Ortho_Wasm.Init;
      Simple_IO.Put_Line_Err ("CE: Register_BE");
      Translation.Register_Translation_Back_End;
      Simple_IO.Put_Line_Err ("CE: Translation.Initialize");
      Translation.Initialize;
      Simple_IO.Put_Line_Err ("CE: Translation.Elaborate");
      Translation.Elaborate (Config, Whole => True);
      Simple_IO.Put_Line_Err ("CE: Ortho_Wasm.Finish");
      Ortho_Wasm.Finish;
      Simple_IO.Put_Line_Err ("CE: Translation.Finalize");
      Translation.Finalize;
      Simple_IO.Put_Line_Err ("CE: done");
      return 0;
   end Compile_Elab;

end Libghdl;
