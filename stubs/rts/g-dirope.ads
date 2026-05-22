--  Minimal GNAT.Directory_Operations stub for wasm32.
package GNAT.Directory_Operations is
   pragma Preelaborate;

   type Dir_Name_Str is new String;

   function Get_Current_Dir return String;

end GNAT.Directory_Operations;
