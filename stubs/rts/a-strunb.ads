--  Minimal Ada.Strings.Unbounded stub for wasm32.
--  Only the operations GHDL actually calls.
package Ada.Strings.Unbounded is
   pragma Preelaborate;

   type Unbounded_String is private;
   Null_Unbounded_String : constant Unbounded_String;

   function To_Unbounded_String (S : String) return Unbounded_String;
   function To_String (S : Unbounded_String) return String;
   function Length (S : Unbounded_String) return Natural;

   procedure Append (Source : in out Unbounded_String; New_Item : String);
   procedure Append (Source : in out Unbounded_String; New_Item : Character);

private
   type String_Acc is access String;
   type Unbounded_String is record
      Buf : String_Acc := null;
      Len : Natural    := 0;
   end record;
   Null_Unbounded_String : constant Unbounded_String := (null, 0);
end Ada.Strings.Unbounded;
