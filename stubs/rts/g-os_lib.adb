--  Stub bodies — return failure / no-op. Real behaviour wired to JS later.
with System;

package body GNAT.OS_Lib is

   function Open_Read (Name : String; Fmode : Mode) return File_Descriptor is
      pragma Unreferenced (Name, Fmode);
   begin return Invalid_FD; end Open_Read;

   function Open_Read (Name : System.Address; Fmode : Mode) return File_Descriptor is
      pragma Unreferenced (Name, Fmode);
   begin return Invalid_FD; end Open_Read;

   function Create_File (Name : String; Fmode : Mode) return File_Descriptor is
      pragma Unreferenced (Name, Fmode);
   begin return Invalid_FD; end Create_File;

   function Create_File (Name : System.Address; Fmode : Mode) return File_Descriptor is
      pragma Unreferenced (Name, Fmode);
   begin return Invalid_FD; end Create_File;

   procedure Close (FD : File_Descriptor) is
      pragma Unreferenced (FD);
   begin null; end Close;

   procedure Close (FD : File_Descriptor; Status : out Boolean) is
      pragma Unreferenced (FD);
   begin Status := False; end Close;

   function Read (FD : File_Descriptor; A : System.Address; N : Integer) return Integer is
      pragma Unreferenced (FD, A, N);
   begin return -1; end Read;

   function Write (FD : File_Descriptor; A : System.Address; N : Integer) return Integer is
      pragma Unreferenced (FD, A, N);
   begin return -1; end Write;

   function File_Length (FD : File_Descriptor) return Long_Integer is
      pragma Unreferenced (FD);
   begin return -1; end File_Length;

   function File_Time_Stamp (Name : String) return OS_Time is
      pragma Unreferenced (Name);
   begin return Invalid_Time; end File_Time_Stamp;

   function File_Time_Stamp (Name : System.Address) return OS_Time is
      pragma Unreferenced (Name);
   begin return Invalid_Time; end File_Time_Stamp;

   function Is_Absolute_Path (Name : String) return Boolean is
   begin return Name'Length > 0 and then Name (Name'First) = '/'; end Is_Absolute_Path;

   function Is_Directory (Name : String) return Boolean is
      pragma Unreferenced (Name);
   begin return False; end Is_Directory;

   function Is_Regular_File (Name : String) return Boolean is
      pragma Unreferenced (Name);
   begin return False; end Is_Regular_File;

   function Is_Executable_File (Name : String) return Boolean is
      pragma Unreferenced (Name);
   begin return False; end Is_Executable_File;

   function Is_Executable_File (Name : System.Address) return Boolean is
      pragma Unreferenced (Name);
   begin return False; end Is_Executable_File;

   procedure Delete_File (Name : String; Success : out Boolean) is
      pragma Unreferenced (Name);
   begin Success := False; end Delete_File;

   procedure Rename_File (Old_Name, New_Name : String; Success : out Boolean) is
      pragma Unreferenced (Old_Name, New_Name);
   begin Success := False; end Rename_File;

   function Spawn (Program_Name : String;
                   Args         : Argument_List) return Integer is
      pragma Unreferenced (Program_Name, Args);
   begin return -1; end Spawn;

   procedure Spawn (Program_Name : String;
                    Args         : Argument_List;
                    Success      : out Boolean) is
      pragma Unreferenced (Program_Name, Args);
   begin Success := False; end Spawn;

   function Locate_Exec_On_Path (Exec_Name : String) return String_Access is
      pragma Unreferenced (Exec_Name);
   begin return null; end Locate_Exec_On_Path;

   procedure OS_Exit (Status : Integer) is
      procedure C_Exit (Status : Integer);
      pragma Import (C, C_Exit, "exit");
   begin
      C_Exit (Status);
   end OS_Exit;

end GNAT.OS_Lib;
