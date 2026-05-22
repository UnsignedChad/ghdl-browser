--  Minimal Ada.Command_Line stub for wasm32.
package Ada.Command_Line is
   pragma Preelaborate;

   function Argument_Count return Natural;
   function Argument (Number : Positive) return String;
   function Command_Name return String;

end Ada.Command_Line;
