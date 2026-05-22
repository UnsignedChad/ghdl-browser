--  Stub bodies — return failure / no-op. Real behaviour to be wired
--  to JS imports via Emscripten in a later pass.
package body GNAT.OS_Lib is
   function Open_Read (Name : String; Fmode : Mode) return File_Descriptor is
      pragma Unreferenced (Name, Fmode);
   begin
      return Invalid_FD;
   end Open_Read;

   function Create_File (Name : String; Fmode : Mode) return File_Descriptor is
      pragma Unreferenced (Name, Fmode);
   begin
      return Invalid_FD;
   end Create_File;

   procedure Close (FD : File_Descriptor) is
      pragma Unreferenced (FD);
   begin
      null;
   end Close;

   procedure Close (FD : File_Descriptor; Status : out Boolean) is
      pragma Unreferenced (FD);
   begin
      Status := False;
   end Close;

   function Read (FD : File_Descriptor; A : System.Address; N : Integer) return Integer is
      pragma Unreferenced (FD, A, N);
   begin
      return 0;
   end Read;

   function Write (FD : File_Descriptor; A : System.Address; N : Integer) return Integer is
      pragma Unreferenced (FD, A);
   begin
      return N;
   end Write;

   function File_Length (FD : File_Descriptor) return Long_Integer is
      pragma Unreferenced (FD);
   begin
      return 0;
   end File_Length;

   function Is_Absolute_Path (Name : String) return Boolean is
   begin
      return Name'Length > 0 and then Name (Name'First) = '/';
   end Is_Absolute_Path;

   function Is_Directory (Name : String) return Boolean is
      pragma Unreferenced (Name);
   begin
      return False;
   end Is_Directory;

   function Is_Regular_File (Name : String) return Boolean is
      pragma Unreferenced (Name);
   begin
      return False;
   end Is_Regular_File;

   function Is_Executable_File (Name : String) return Boolean is
      pragma Unreferenced (Name);
   begin
      return False;
   end Is_Executable_File;

   procedure Delete_File (Name : String; Success : out Boolean) is
      pragma Unreferenced (Name);
   begin
      Success := False;
   end Delete_File;

   procedure Rename_File (Old_Name, New_Name : String; Success : out Boolean) is
      pragma Unreferenced (Old_Name, New_Name);
   begin
      Success := False;
   end Rename_File;

   procedure Spawn (Program_Name : String;
                    Args         : Argument_List;
                    Success      : out Boolean) is
      pragma Unreferenced (Program_Name, Args);
   begin
      Success := False;
   end Spawn;

   procedure OS_Exit (Status : Integer) is
      pragma Unreferenced (Status);
   begin
      loop null; end loop;  --  trap until JS shim provides real exit
   end OS_Exit;
end GNAT.OS_Lib;
