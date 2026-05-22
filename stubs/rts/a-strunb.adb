package body Ada.Strings.Unbounded is
   procedure Free_Buf (S : in out Unbounded_String) is
      pragma Unreferenced (S);
   begin
      null;  --  bare-board: no Unchecked_Deallocation; leak
   end Free_Buf;

   function To_Unbounded_String (S : String) return Unbounded_String is
      R : Unbounded_String;
   begin
      R.Buf := new String'(S);
      R.Len := S'Length;
      return R;
   end To_Unbounded_String;

   function To_String (S : Unbounded_String) return String is
   begin
      if S.Buf = null then return ""; end if;
      return S.Buf (S.Buf'First .. S.Buf'First + S.Len - 1);
   end To_String;

   function Length (S : Unbounded_String) return Natural is
   begin
      return S.Len;
   end Length;

   procedure Append (Source : in out Unbounded_String; New_Item : String) is
      Cur : constant Natural := Source.Len;
      New_Buf : constant String_Acc :=
        new String (1 .. Cur + New_Item'Length);
   begin
      if Cur > 0 and then Source.Buf /= null then
         New_Buf (1 .. Cur) := Source.Buf (Source.Buf'First .. Source.Buf'First + Cur - 1);
      end if;
      New_Buf (Cur + 1 .. Cur + New_Item'Length) := New_Item;
      Source.Buf := New_Buf;
      Source.Len := Cur + New_Item'Length;
   end Append;

   procedure Append (Source : in out Unbounded_String; New_Item : Character) is
      S : String (1 .. 1);
   begin
      S (1) := New_Item;
      Append (Source, S);
   end Append;
end Ada.Strings.Unbounded;
