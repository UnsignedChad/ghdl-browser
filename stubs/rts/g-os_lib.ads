--  Minimal GNAT.OS_Lib stub for wasm32 browser target.
--  All file/OS operations return failure; browser target has no real FS.
with System;
with Ada.Unchecked_Deallocation;

package GNAT.OS_Lib is
   pragma Preelaborate;

   subtype File_Descriptor is Integer;
   Standin  : constant File_Descriptor := 0;
   Standout : constant File_Descriptor := 1;
   Standerr : constant File_Descriptor := 2;
   Invalid_FD : constant File_Descriptor := -1;

   type Mode is (Binary, Text);
   for Mode use (Binary => 0, Text => 1);

   type OS_Time is new Long_Long_Integer;
   Invalid_Time : constant OS_Time := -1;

   type String_Access is access all String;
   type String_List is array (Positive range <>) of String_Access;
   subtype Argument_List is String_List;
   type Argument_List_Access is access all Argument_List;

   Directory_Separator : constant Character := '/';
   Path_Separator      : constant Character := ':';

   --  Open with Ada String name
   function Open_Read (Name : String; Fmode : Mode) return File_Descriptor;
   --  Open with C null-terminated string address
   function Open_Read (Name : System.Address; Fmode : Mode) return File_Descriptor;

   function Create_File (Name : String; Fmode : Mode) return File_Descriptor;
   function Create_File (Name : System.Address; Fmode : Mode) return File_Descriptor;

   procedure Close (FD : File_Descriptor);
   procedure Close (FD : File_Descriptor; Status : out Boolean);

   function Read  (FD : File_Descriptor; A : System.Address; N : Integer) return Integer;
   function Write (FD : File_Descriptor; A : System.Address; N : Integer) return Integer;

   function File_Length (FD : File_Descriptor) return Long_Integer;
   function File_Time_Stamp (Name : String) return OS_Time;
   function File_Time_Stamp (Name : System.Address) return OS_Time;

   function Is_Absolute_Path   (Name : String) return Boolean;
   function Is_Directory        (Name : String) return Boolean;
   function Is_Regular_File     (Name : String) return Boolean;
   function Is_Executable_File  (Name : String) return Boolean;
   function Is_Executable_File  (Name : System.Address) return Boolean;

   procedure Delete_File (Name : String; Success : out Boolean);
   procedure Rename_File (Old_Name, New_Name : String; Success : out Boolean);

   --  Spawn: function form returns exit status
   function Spawn (Program_Name : String;
                   Args         : Argument_List) return Integer;
   --  Spawn: procedure form sets Success
   procedure Spawn (Program_Name : String;
                    Args         : Argument_List;
                    Success      : out Boolean);

   function Locate_Exec_On_Path (Exec_Name : String) return String_Access;

   procedure Free is new Ada.Unchecked_Deallocation (String, String_Access);

   procedure OS_Exit (Status : Integer);
   pragma No_Return (OS_Exit);

end GNAT.OS_Lib;
