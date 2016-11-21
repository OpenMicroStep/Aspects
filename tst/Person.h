@interface Person : ASEntity {
  int _version;
  NSString* _firstName;
  NSString* _lastName;
  NSDate* _birthDate;
}

- (NSString *)firstName();
- (NSString *)lastName();
- (NSString *)fullName();
- (NSDate *)birthDate();
- (int)age();

@end
