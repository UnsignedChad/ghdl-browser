--  Minimal GNAT.OS_Lib stub for wasm32 browser target.
--  All file operations return failure; predicates return False;
--  OS_Exit/abort are wired to ghdl runtime if needed.
with System;

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
   type Argument_List is new String_List;
   type Argument_List_Access is access all Argument_List;

   Directory_Separator : constant Character := '/';
   Path_Separator      : constant Character := ':';

   function Open_Read (Name : String; Fmode : Mode) return File_Descriptor;
   function Create_File (Name : String; Fmode : Mode) return File_Descriptor;
   procedure Close (FD : File_Descriptor);
   procedure Close (FD : File_Descriptor; Status : out Boolean);
   function Read  (FD : File_Descriptor; A : System.Address; N : Integer) return Integer;
   function Write (FD : File_Descriptor; A : System.Address; N : Integer) return Integer;

   function File_Length (FD : File_Descriptor) return Long_Integer;

   function Is_Absolute_Path (Name : String) return Boolean;
   function Is_Directory     (Name : String) return Boolean;
   function Is_Regular_File  (Name : String) return Boolean;
   function Is_Executable_File (Name : String) return Boolean;

   procedure Delete_File (Name : String; Success : out Boolean);
   procedure Rename_File (Old_Name, New_Name : String; Success : out Boolean);

   procedure Spawn (Program_Name : String;
                    Args         : Argument_List;
                    Success      : out Boolean);

   procedure OS_Exit (Status : Integer);
   pragma No_Return (OS_Exit);

end GNAT.OS_Lib;
